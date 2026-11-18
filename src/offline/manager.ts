import * as Network from 'expo-network';
import { AppState } from 'react-native';
import { useSyncExternalStore } from 'react';

import type { Command } from '../domain/commands';
import { asManualCheckIn, isTripCommand } from '../domain/commands';
import type { Trip } from '../domain/trip';
import { newKey } from '../device';
import { makeApi } from './api';
import { createEngine } from './engine';
import { clearAccount, clearSnapshots, countSamples, readMeta, sqliteStore, writeMeta } from './sqliteStore';
import type { OutboxRow, TrackingSample } from './types';

// Glue between the engine and the app: it holds the rows for the screens, decides when to run the
// engine (on a new row, on the connection coming back, on returning to the app, on a timer) and tells
// the screens what changed. One instance for the whole app.

const INTERVAL_MS = 30_000;
const LAST_ACCOUNT_KEY = 'lastAccount';

type Context = { accountId: string; token: string };
type Listener = () => void;

class OfflineManager {
  private ctx: Context | null = null;
  private rows: OutboxRow[] = [];
  private samples = 0;
  private listeners = new Set<Listener>();
  private engine: ReturnType<typeof createEngine> | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private cleanups: (() => void)[] = [];
  private running = false;
  private again = false;

  /** Set by the root layout: put a trip the engine saved into the screens' cache. */
  onTrip: (trip: Trip) => void = () => undefined;
  onSettled: () => void = () => undefined;

  subscribe = (listener: Listener) => {
    this.listeners.add(listener);
    return () => void this.listeners.delete(listener);
  };
  getRows = () => this.rows;
  getSampleCount = () => this.samples;

  private emit() {
    for (const listener of this.listeners) listener();
  }

  async refresh() {
    this.rows = await sqliteStore.listRows();
    this.samples = this.ctx ? await countSamples(this.ctx.accountId) : 0;
    this.emit();
  }

  /** Called when a driver is signed in (or signs out: null). The queued work stays on the phone either way. */
  async configure(ctx: Context | null) {
    this.stop();
    this.ctx = ctx;
    if (!ctx) {
      this.engine = null;
      await this.refresh();
      return;
    }
    // A different driver on this phone must not see the last one's trips, even offline.
    const last = await readMeta<string>(LAST_ACCOUNT_KEY);
    if (last && last.value !== ctx.accountId) await clearSnapshots();
    await writeMeta(LAST_ACCOUNT_KEY, ctx.accountId);

    this.engine = createEngine(sqliteStore, makeApi(ctx.token), { onChange: () => void this.refresh() });
    await this.refresh();
    this.start();
    void this.kick();
  }

  private start() {
    this.timer = setInterval(() => void this.kick(), INTERVAL_MS);
    const net = Network.addNetworkStateListener((state) => {
      if (state.isConnected && state.isInternetReachable !== false) void this.kick();
    });
    const app = AppState.addEventListener('change', (state) => {
      if (state === 'active') void this.kick();
    });
    this.cleanups = [() => net.remove(), () => app.remove()];
  }

  private stop() {
    if (this.timer) clearInterval(this.timer);
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.timer = this.retryTimer = null;
    for (const cleanup of this.cleanups) cleanup();
    this.cleanups = [];
  }

  /** Sends what is waiting. Safe to call at any time; overlapping calls are folded into one more pass. */
  async kick() {
    if (!this.ctx || !this.engine) return;
    if (this.running) {
      this.again = true;
      return;
    }
    this.running = true;
    try {
      do {
        this.again = false;
        const before = (await sqliteStore.listRows()).filter((r) => r.accountId === this.ctx?.accountId && isTripCommand(r.command.kind));
        const tripIds = [...new Set(before.filter((r) => r.status !== 'done').map((r) => r.tripId))];
        const result = await this.engine.run(this.ctx.accountId);
        for (const id of tripIds) {
          const trip = await sqliteStore.getTrip(id);
          if (trip) this.onTrip(trip);
        }
        await this.refresh();
        if (tripIds.length > 0) this.onSettled();
        if (result === 'waiting') {
          if (this.retryTimer) clearTimeout(this.retryTimer);
          this.retryTimer = setTimeout(() => void this.kick(), 10_000);
        }
      } while (this.again);
    } finally {
      this.running = false;
    }
  }

  /** Stores a command and sends it as soon as there is a connection. */
  async enqueue(tripId: string, command: Command): Promise<void> {
    if (!this.ctx) throw new Error('Not signed in');
    await sqliteStore.insertRow({
      id: newKey(),
      accountId: this.ctx.accountId,
      tripId,
      seq: 0, // assigned by the store, atomically
      command,
      idempotencyKey: newKey(),
      status: 'pending',
      attempts: 0,
      nextAttemptAt: 0,
      error: null,
      createdAt: Date.now(),
    });
    await this.refresh();
    void this.kick();
  }

  async addSamples(samples: TrackingSample[]) {
    await sqliteStore.addSamples(samples);
    this.samples = this.ctx ? await countSamples(this.ctx.accountId) : 0;
    this.emit();
  }

  /** Try a failed row again now. */
  async retry(id: string) {
    await sqliteStore.updateRow(id, { status: 'pending', error: null, attempts: 0, nextAttemptAt: 0 });
    await this.refresh();
    void this.kick();
  }

  /** A check-in refused for being away from the stop becomes a manual one, with the driver's reason. */
  async retryAsManualCheckIn(id: string, reason: string) {
    const row = this.rows.find((r) => r.id === id);
    const command = row ? asManualCheckIn(row.command, reason) : null;
    if (!row || !command) return;
    await sqliteStore.updateRow(id, { command, status: 'pending', error: null, attempts: 0, nextAttemptAt: 0 });
    await this.refresh();
    void this.kick();
  }

  /** Throw a row away. Rows behind it in the same trip are then free to go (they may fail on their own). */
  async discard(id: string) {
    await sqliteStore.deleteRow(id);
    await this.refresh();
    void this.kick();
  }

  /** Rows that belong to another driver who used this phone. */
  foreignCount(accountId: string): number {
    return this.rows.filter((r) => r.accountId !== accountId && r.status !== 'done').length;
  }

  async discardForeign(accountId: string) {
    const accounts = new Set(this.rows.filter((r) => r.accountId !== accountId).map((r) => r.accountId));
    for (const id of accounts) await clearAccount(id);
    await this.refresh();
  }
}

export const offline = new OfflineManager();

export function useOutboxRows(): OutboxRow[] {
  return useSyncExternalStore(offline.subscribe, offline.getRows, offline.getRows);
}

export function useSampleCount(): number {
  return useSyncExternalStore(offline.subscribe, offline.getSampleCount, offline.getSampleCount);
}

export type OutboxSummary = { waiting: number; failed: number; samples: number };

export function summarize(rows: OutboxRow[], accountId: string | undefined, samples: number): OutboxSummary {
  const mine = rows.filter((r) => r.accountId === accountId);
  return {
    waiting: mine.filter((r) => r.status === 'pending' || r.status === 'sending').length,
    failed: mine.filter((r) => r.status === 'failed').length,
    samples,
  };
}
