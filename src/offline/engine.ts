import { applyCommand, effectApplied, isTripCommand, type Command } from '../domain/commands';
import type { Trip } from '../domain/trip';
import { classify } from './classify';
import type { EngineApi, Failure, OfflineStore, OutboxRow, RunResult, TrackingSample } from './types';

// The sender. Rules (each prevents a failure found while reading the backend):
//  1. One Idempotency-Key per row, made with the row; a retry reuses it.
//  2. The version (If-Match) is never stored in a row: it is read from the latest server copy when the row is
//     sent, and the response replaces that copy before the next row.
//  3. Per trip, one command at a time, in order. A failed row blocks the rows after it until the driver decides.
//  4. A 412 is not a failure yet: re-read the trip; if it already shows the step, the row is done.
//  5. GPS samples go first, so the server can judge a later check-in by where the vehicle was.
//  6. A time-out keeps the row and stops the run: the connection is the problem, not the row.

const MAX_SERVER_ATTEMPTS = 6;
const DONE_KEEP_MS = 24 * 60 * 60 * 1000;
const TRACKING_BATCH = 100;

export const backoffMs = (attempts: number) => Math.min(300, 5 * 2 ** attempts) * 1000;

type Outcome = 'done' | 'failed' | 'backoff' | 'offline' | 'auth';

export function createEngine(
  store: OfflineStore,
  api: EngineApi,
  options: { now?: () => number; newKey?: () => string; onChange?: () => void } = {},
) {
  const now = options.now ?? Date.now;
  const newKey = options.newKey ?? (() => `${now()}-${Math.random().toString(36).slice(2, 10)}`);
  const changed = () => options.onChange?.();
  let running = false;

  const patch = async (id: string, change: Partial<Omit<OutboxRow, 'id'>>) => {
    await store.updateRow(id, change);
    changed();
  };

  const fail = (row: OutboxRow, code: string, detail: string | null) =>
    patch(row.id, { status: 'failed', error: { code, detail }, attempts: row.attempts + 1 });

  /** Common reaction to a failure that is not specific to a command. Returns null when the caller must decide. */
  async function handleFailure(row: OutboxRow, failure: Failure): Promise<Outcome | null> {
    switch (failure.type) {
      case 'network':
        await patch(row.id, { status: 'pending', attempts: row.attempts + 1, nextAttemptAt: now() + backoffMs(row.attempts) });
        return 'offline';
      case 'auth':
        await patch(row.id, { status: 'pending' });
        return 'auth';
      case 'rejected':
        await fail(row, `HTTP_${failure.status}`, failure.detail);
        return 'failed';
      case 'server':
        if (row.attempts + 1 >= MAX_SERVER_ATTEMPTS) {
          await fail(row, `HTTP_${failure.status}`, null);
          return 'failed';
        }
        await patch(row.id, { status: 'pending', attempts: row.attempts + 1, nextAttemptAt: now() + backoffMs(row.attempts) });
        return 'backoff';
      case 'stale':
        return null;
    }
  }

  async function currentTrip(tripId: string): Promise<Trip> {
    const stored = await store.getTrip(tripId);
    if (stored) return stored;
    const fresh = await api.fetchTrip(tripId);
    await store.saveTrip(fresh);
    return fresh;
  }

  async function queuePhoto(row: OutboxRow, proofId: string) {
    const command = row.command;
    if (command.kind !== 'POD' || !command.photo) return;
    await store.insertRow({
      id: newKey(),
      accountId: row.accountId,
      tripId: row.tripId,
      seq: 0, // the store assigns the real number
      command: { kind: 'POD_PHOTO', proofId, photo: command.photo, clientDocumentId: command.clientDocumentId },
      idempotencyKey: newKey(),
      status: 'pending',
      attempts: 0,
      nextAttemptAt: 0,
      error: null,
      createdAt: now(),
    });
  }

  async function finish(row: OutboxRow, trip: Trip, proofId?: string) {
    await store.saveTrip(trip);
    await patch(row.id, { status: 'done', error: null });
    if (proofId) await queuePhoto(row, proofId);
  }

  async function send(command: Command, row: OutboxRow, trip: Trip): Promise<{ trip: Trip; proofId?: string }> {
    switch (command.kind) {
      case 'START':
        return { trip: await api.startTrip(row.tripId, trip.version, row.idempotencyKey, command.occurredAt) };
      case 'COMPLETE':
        return { trip: await api.completeTrip(row.tripId, trip.version, row.idempotencyKey, command.occurredAt) };
      case 'CHECK_IN':
        return {
          trip: await api.checkIn(row.tripId, command.stopId, trip.version, {
            occurredAt: command.occurredAt,
            manualOverride: command.manualOverride,
            overrideReason: command.overrideReason,
          }),
        };
      case 'CHECK_OUT':
        return { trip: await api.checkOut(row.tripId, command.stopId, trip.version, command.occurredAt) };
      case 'POD': {
        const result = await api.captureProof(row.tripId, command.stopId, trip.version, row.idempotencyKey, {
          recipientName: command.recipientName,
          deliveredAt: command.deliveredAt,
          notes: command.notes,
        });
        // The proof call answers with the proof and the new version, not the trip: patch our copy.
        return { trip: { ...applyCommand(trip, command), version: result.version ?? trip.version }, proofId: result.proofId };
      }
      default:
        throw new Error(`Not a trip command: ${command.kind}`);
    }
  }

  async function processTripRow(row: OutboxRow): Promise<Outcome> {
    await patch(row.id, { status: 'sending' });
    try {
      let trip = await currentTrip(row.tripId);
      for (let attempt = 0; attempt < 2; attempt++) {
        if (effectApplied(trip, row.command)) {
          const proofId =
            row.command.kind === 'POD' && row.command.photo
              ? await api.fetchProofId(row.tripId, row.command.stopId)
              : undefined;
          await finish(row, trip, proofId);
          return 'done';
        }
        try {
          const sent = await send(row.command, row, trip);
          await finish(row, sent.trip, sent.proofId);
          return 'done';
        } catch (error) {
          const failure = classify(error);
          if (failure.type !== 'stale') {
            const outcome = await handleFailure(row, failure);
            if (outcome) return outcome;
          }
          // Stale: the trip changed under us. Re-read it and look again.
          trip = await api.fetchTrip(row.tripId);
          await store.saveTrip(trip);
        }
      }
      await fail(row, 'STALE', null);
      return 'failed';
    } catch (error) {
      // Only the re-read of the trip can get here.
      return (await handleFailure(row, classify(error))) ?? 'failed';
    }
  }

  async function processSideRow(row: OutboxRow): Promise<Outcome> {
    await patch(row.id, { status: 'sending' });
    const command = row.command;
    try {
      switch (command.kind) {
        case 'ACK':
          await api.acknowledge(row.tripId, command.accepted, command.reason);
          break;
        case 'PROBLEM':
          await api.reportProblem(row.tripId, { type: command.type, severity: command.severity, description: command.description });
          break;
        case 'NOTE':
          await api.addNote(row.tripId, command.text);
          break;
        case 'LOAD_REQUEST':
          await api.requestLoadRemoval(row.tripId, row.idempotencyKey, {
            loadId: command.loadId,
            reasonCode: command.reasonCode,
            reasonText: command.reasonText,
          });
          break;
        case 'POD_PHOTO':
          await api.uploadPhoto(command.proofId, command.photo, command.clientDocumentId);
          break;
        default:
          throw new Error(`Not a side command: ${command.kind}`);
      }
      await patch(row.id, { status: 'done', error: null });
      return 'done';
    } catch (error) {
      const failure = classify(error);
      if (failure.type === 'stale') {
        await fail(row, 'STALE', null);
        return 'failed';
      }
      return (await handleFailure(row, failure)) ?? 'failed';
    }
  }

  /**
   * Sends one batch. The server refuses a whole batch for one bad point (an implausible jump), so a refused batch is
   * split in halves until the bad point stands alone; only that point is dropped, the good ones are kept and sent.
   */
  async function sendBatch(tripId: string, batch: TrackingSample[]): Promise<Failure | null> {
    try {
      await api.sendTracking(
        tripId,
        batch.map(({ tripId: _t, accountId: _a, ...item }) => item),
      );
    } catch (error) {
      const failure = classify(error);
      if (failure.type !== 'rejected' || failure.status === 429) return failure;
      if (batch.length === 1) {
        await store.deleteSamples([batch[0].clientEventId]);
        return null;
      }
      const middle = Math.ceil(batch.length / 2);
      for (const half of [batch.slice(0, middle), batch.slice(middle)]) {
        const result = await sendBatch(tripId, half);
        if (result) return result;
      }
      return null;
    }
    await store.deleteSamples(batch.map((x) => x.clientEventId));
    return null;
  }

  /** Sends the stored GPS samples, oldest first. Returns the failure that stopped it, if any. */
  async function flushTracking(accountId: string): Promise<Failure | null> {
    for (const tripId of await store.sampleTripIds(accountId)) {
      for (;;) {
        const batch = await store.listSamples(accountId, tripId, TRACKING_BATCH);
        if (batch.length === 0) break;
        const failure = await sendBatch(tripId, batch);
        if (failure) return failure;
      }
    }
    return null;
  }

  async function run(accountId: string): Promise<RunResult> {
    if (running) return 'waiting';
    running = true;
    let waiting = false;
    try {
      let rows = (await store.listRows()).filter((row) => row.accountId === accountId);

      // A row left "sending" means the app died mid-request. It goes back to pending; the key and the 412 check keep that safe.
      for (const row of rows.filter((r) => r.status === 'sending')) await store.updateRow(row.id, { status: 'pending' });
      rows = (await store.listRows()).filter((row) => row.accountId === accountId);

      const gps = await flushTracking(accountId);
      if (gps?.type === 'network') return 'offline';
      if (gps?.type === 'auth') return 'auth';

      const open = rows.filter((row) => row.status !== 'done').sort((a, b) => a.seq - b.seq);
      const byTrip = new Map<string, OutboxRow[]>();
      for (const row of open.filter((r) => isTripCommand(r.command.kind))) {
        byTrip.set(row.tripId, [...(byTrip.get(row.tripId) ?? []), row]);
      }

      for (const group of byTrip.values()) {
        if (group.some((row) => row.status === 'failed')) continue; // blocked until the driver decides
        for (const row of group) {
          if (row.nextAttemptAt > now()) {
            waiting = true;
            break;
          }
          const outcome = await processTripRow(row);
          if (outcome === 'offline' || outcome === 'auth') return outcome;
          if (outcome !== 'done') break;
        }
      }

      // Read again: a proof made above has just queued its photo.
      const side = (await store.listRows())
        .filter((r) => r.accountId === accountId && !isTripCommand(r.command.kind) && r.status === 'pending')
        .sort((a, b) => a.seq - b.seq);
      for (const row of side) {
        if (row.nextAttemptAt > now()) {
          waiting = true;
          continue;
        }
        const outcome = await processSideRow(row);
        if (outcome === 'offline' || outcome === 'auth') return outcome;
      }

      const after = (await store.listRows()).filter((r) => r.accountId === accountId);
      for (const row of after.filter((r) => r.status === 'done' && now() - r.createdAt > DONE_KEEP_MS)) {
        await store.deleteRow(row.id);
      }
      return waiting ? 'waiting' : 'idle';
    } finally {
      running = false;
      changed();
    }
  }

  return { run };
}
