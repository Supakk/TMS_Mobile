import * as SQLite from 'expo-sqlite';

import type { Command } from '../domain/commands';
import type { Trip } from '../domain/trip';
import type { OfflineStore, OutboxRow, TrackingSample } from './types';

// Local snapshot and outbox. Tokens are NOT stored here (secure storage only): this file holds trips,
// queued commands and GPS samples, none of which are secrets.

let opened: Promise<SQLite.SQLiteDatabase> | null = null;

/** Gives every row a distinct number 1..n in the order (seq, rowid). Run only when duplicates exist. */
export const REPAIR_SEQ = `
  DROP TABLE IF EXISTS seq_fix;
  CREATE TEMP TABLE seq_fix AS
    SELECT o1.id AS id,
           (SELECT COUNT(*) FROM outbox o2
            WHERE o2.seq < o1.seq OR (o2.seq = o1.seq AND o2.rowid <= o1.rowid)) AS n
    FROM outbox o1;
  UPDATE outbox SET seq = (SELECT n FROM seq_fix WHERE seq_fix.id = outbox.id);
  DROP TABLE seq_fix;
`;

/** Creates the tables and brings an older database up to date. Exported so it can be tried on an old copy. */
export async function migrate(db: SQLite.SQLiteDatabase): Promise<void> {
    await db.execAsync(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS outbox (
      id TEXT PRIMARY KEY NOT NULL,
      account_id TEXT NOT NULL,
      trip_id TEXT NOT NULL,
      seq INTEGER NOT NULL,
      command TEXT NOT NULL,
      idempotency_key TEXT NOT NULL,
      status TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      next_attempt_at INTEGER NOT NULL DEFAULT 0,
      error TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS trips (
      id TEXT PRIMARY KEY NOT NULL,
      json TEXT NOT NULL,
      saved_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY NOT NULL,
      json TEXT NOT NULL,
      saved_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS tracking (
      client_event_id TEXT PRIMARY KEY NOT NULL,
      account_id TEXT NOT NULL,
      trip_id TEXT NOT NULL,
      occurred_at TEXT NOT NULL,
      json TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS tracking_order ON tracking (account_id, trip_id, occurred_at);
  `);
  // A phone that ran an earlier build can hold rows with the same order number (the old build took "highest + 1"
  // outside the write). The unique index would refuse to build on them and the database would not open, so the
  // numbers are first made distinct: rows keep their relative order (by number, then by when they were stored).
  await db.withTransactionAsync(async () => {
    const dup = await db.getFirstAsync<{ n: number }>(
      'SELECT 1 AS n FROM outbox GROUP BY seq HAVING COUNT(*) > 1 LIMIT 1',
    );
    if (dup) await db.execAsync(REPAIR_SEQ);
    await db.execAsync('DROP INDEX IF EXISTS outbox_seq; CREATE UNIQUE INDEX IF NOT EXISTS outbox_seq_unique ON outbox (seq);');
  });
}

function open(): Promise<SQLite.SQLiteDatabase> {
  opened ??= (async () => {
    const db = await SQLite.openDatabaseAsync('tms.db');
    await migrate(db);
    return db;
  })();
  return opened;
}

let writes: Promise<unknown> = Promise.resolve();

/** Runs writes one after another, whoever asks and whenever. */
function serialized<T>(task: () => Promise<T>): Promise<T> {
  const next = writes.then(task, task);
  writes = next.catch(() => undefined);
  return next;
}

type RowRecord = {
  id: string;
  account_id: string;
  trip_id: string;
  seq: number;
  command: string;
  idempotency_key: string;
  status: OutboxRow['status'];
  attempts: number;
  next_attempt_at: number;
  error: string | null;
  created_at: number;
};

const toRow = (r: RowRecord): OutboxRow => ({
  id: r.id,
  accountId: r.account_id,
  tripId: r.trip_id,
  seq: r.seq,
  command: JSON.parse(r.command) as Command,
  idempotencyKey: r.idempotency_key,
  status: r.status,
  attempts: r.attempts,
  nextAttemptAt: r.next_attempt_at,
  error: r.error ? (JSON.parse(r.error) as OutboxRow['error']) : null,
  createdAt: r.created_at,
});

const COLUMN: Record<string, string> = {
  status: 'status',
  attempts: 'attempts',
  nextAttemptAt: 'next_attempt_at',
  error: 'error',
  command: 'command',
  tripId: 'trip_id',
  accountId: 'account_id',
  seq: 'seq',
  idempotencyKey: 'idempotency_key',
  createdAt: 'created_at',
};

export const sqliteStore: OfflineStore = {
  async listRows() {
    const db = await open();
    return (await db.getAllAsync<RowRecord>('SELECT * FROM outbox ORDER BY seq')).map(toRow);
  },
  // The order number is taken inside the INSERT, so two commands made at the same moment can never get the
  // same one; writes also go through one queue. The number given in `row` is ignored.
  async insertRow(row) {
    await serialized(async () => {
      const db = await open();
      await db.runAsync(
        'INSERT INTO outbox (id, account_id, trip_id, seq, command, idempotency_key, status, attempts, next_attempt_at, error, created_at) VALUES (?,?,?,(SELECT COALESCE(MAX(seq), 0) + 1 FROM outbox),?,?,?,?,?,?,?)',
        row.id,
        row.accountId,
        row.tripId,
        JSON.stringify(row.command),
        row.idempotencyKey,
        row.status,
        row.attempts,
        row.nextAttemptAt,
        row.error ? JSON.stringify(row.error) : null,
        row.createdAt,
      );
    });
  },
  async updateRow(id, patch) {
    const db = await open();
    const entries = Object.entries(patch).filter(([key]) => COLUMN[key]);
    if (entries.length === 0) return;
    const sets = entries.map(([key]) => `${COLUMN[key]} = ?`).join(', ');
    const values = entries.map(([key, value]) =>
      key === 'command' || key === 'error' ? (value === null ? null : JSON.stringify(value)) : (value as string | number),
    );
    await db.runAsync(`UPDATE outbox SET ${sets} WHERE id = ?`, ...values, id);
  },
  async deleteRow(id) {
    const db = await open();
    await db.runAsync('DELETE FROM outbox WHERE id = ?', id);
  },
  async nextSeq() {
    const db = await open();
    const row = await db.getFirstAsync<{ max: number | null }>('SELECT MAX(seq) AS max FROM outbox');
    return (row?.max ?? 0) + 1;
  },

  async getTrip(tripId) {
    const db = await open();
    const row = await db.getFirstAsync<{ json: string }>('SELECT json FROM trips WHERE id = ?', tripId);
    return row ? (JSON.parse(row.json) as Trip) : null;
  },
  async saveTrip(trip) {
    const db = await open();
    await db.runAsync('INSERT OR REPLACE INTO trips (id, json, saved_at) VALUES (?,?,?)', trip.id, JSON.stringify(trip), Date.now());
  },

  async addSamples(samples) {
    if (samples.length === 0) return;
    const db = await open();
    await db.withTransactionAsync(async () => {
      for (const s of samples) {
        await db.runAsync(
          'INSERT OR IGNORE INTO tracking (client_event_id, account_id, trip_id, occurred_at, json) VALUES (?,?,?,?,?)',
          s.clientEventId,
          s.accountId,
          s.tripId,
          s.occurredAt,
          JSON.stringify(s),
        );
      }
    });
  },
  async listSamples(accountId, tripId, limit) {
    const db = await open();
    const rows = await db.getAllAsync<{ json: string }>(
      'SELECT json FROM tracking WHERE account_id = ? AND trip_id = ? ORDER BY occurred_at LIMIT ?',
      accountId,
      tripId,
      limit,
    );
    return rows.map((r) => JSON.parse(r.json) as TrackingSample);
  },
  async deleteSamples(ids) {
    if (ids.length === 0) return;
    const db = await open();
    await db.withTransactionAsync(async () => {
      for (const id of ids) await db.runAsync('DELETE FROM tracking WHERE client_event_id = ?', id);
    });
  },
  async deleteSamplesBefore(accountId, isoTime) {
    const db = await open();
    await db.runAsync('DELETE FROM tracking WHERE account_id = ? AND occurred_at < ?', accountId, isoTime);
  },
  async sampleTripIds(accountId) {
    const db = await open();
    const rows = await db.getAllAsync<{ trip_id: string }>('SELECT DISTINCT trip_id FROM tracking WHERE account_id = ?', accountId);
    return rows.map((r) => r.trip_id);
  },
};

/** Small JSON values that are not trips, such as the last /me/sync answer. */
export async function readMeta<T>(key: string): Promise<{ value: T; savedAt: number } | null> {
  const db = await open();
  const row = await db.getFirstAsync<{ json: string; saved_at: number }>('SELECT json, saved_at FROM meta WHERE key = ?', key);
  return row ? { value: JSON.parse(row.json) as T, savedAt: row.saved_at } : null;
}

export async function writeMeta(key: string, value: unknown): Promise<void> {
  const db = await open();
  await db.runAsync('INSERT OR REPLACE INTO meta (key, json, saved_at) VALUES (?,?,?)', key, JSON.stringify(value), Date.now());
}

/** Number of samples still waiting, for the "unsent" count. */
export async function countSamples(accountId: string): Promise<number> {
  const db = await open();
  const row = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM tracking WHERE account_id = ?', accountId);
  return row?.n ?? 0;
}

/** Removes everything for a driver who is no longer using this phone. */
export async function clearAccount(accountId: string): Promise<void> {
  const db = await open();
  await db.runAsync('DELETE FROM outbox WHERE account_id = ?', accountId);
  await db.runAsync('DELETE FROM tracking WHERE account_id = ?', accountId);
}

/** Another driver is using the phone: their trips and list must not show for this one, even offline. */
export async function clearSnapshots(): Promise<void> {
  const db = await open();
  await db.runAsync('DELETE FROM trips');
  await db.runAsync("DELETE FROM meta WHERE key LIKE 'sync:%'");
}
