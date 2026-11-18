import type { Command, RowState } from '../domain/commands';
import type { Trip } from '../domain/trip';

export type OutboxRow = {
  id: string;
  /** Rows belong to the driver account that made them; another driver's rows are never sent. */
  accountId: string;
  tripId: string;
  /** Order of creation. Trip commands are sent in this order. */
  seq: number;
  command: Command;
  /** One per user action, created with the row and reused on every retry. */
  idempotencyKey: string;
  status: RowState;
  attempts: number;
  /** Epoch ms: do not try again before this time. */
  nextAttemptAt: number;
  /** Why it failed, for the driver. Backend text is English; `code` lets the screen translate it. */
  error: { code: string; detail: string | null } | null;
  createdAt: number;
};

export type TrackingSample = {
  clientEventId: string;
  tripId: string;
  accountId: string;
  eventType: string;
  occurredAt: string;
  latitude: number | null;
  longitude: number | null;
  speedKph: number | null;
};

/** Where the engine keeps its state. SQLite in the app, an in-memory fake in the tests. */
export interface OfflineStore {
  listRows(): Promise<OutboxRow[]>;
  insertRow(row: OutboxRow): Promise<void>;
  updateRow(id: string, patch: Partial<Omit<OutboxRow, 'id'>>): Promise<void>;
  deleteRow(id: string): Promise<void>;
  nextSeq(): Promise<number>;

  getTrip(tripId: string): Promise<Trip | null>;
  saveTrip(trip: Trip): Promise<void>;

  addSamples(samples: TrackingSample[]): Promise<void>;
  /** Oldest first. */
  listSamples(accountId: string, tripId: string, limit: number): Promise<TrackingSample[]>;
  deleteSamples(clientEventIds: string[]): Promise<void>;
  sampleTripIds(accountId: string): Promise<string[]>;
}

/** What the engine needs from the network. The real one wraps src/api/trips.ts. */
export interface EngineApi {
  fetchTrip(tripId: string): Promise<Trip>;
  fetchProofId(tripId: string, stopId: string): Promise<string>;
  startTrip(tripId: string, version: string, key: string, occurredAt: string): Promise<Trip>;
  completeTrip(tripId: string, version: string, key: string, occurredAt: string): Promise<Trip>;
  checkIn(
    tripId: string,
    stopId: string,
    version: string,
    body: { occurredAt: string; manualOverride: boolean; overrideReason: string | null },
  ): Promise<Trip>;
  checkOut(tripId: string, stopId: string, version: string, occurredAt: string): Promise<Trip>;
  captureProof(
    tripId: string,
    stopId: string,
    version: string,
    key: string,
    body: { recipientName: string; deliveredAt: string; notes: string | null },
  ): Promise<{ proofId: string; version: string | null }>;
  uploadPhoto(proofId: string, photo: { uri: string; name: string; mimeType: string }, clientDocumentId: string): Promise<void>;
  acknowledge(tripId: string, accepted: boolean, reason: string | null): Promise<void>;
  reportProblem(tripId: string, body: { type: string; severity: string; description: string }): Promise<void>;
  addNote(tripId: string, text: string): Promise<void>;
  requestLoadRemoval(
    tripId: string,
    key: string,
    body: { loadId: string; reasonCode: string; reasonText: string | null },
  ): Promise<void>;
  sendTracking(tripId: string, items: Omit<TrackingSample, 'tripId' | 'accountId'>[]): Promise<void>;
}

/** How the engine tells failures apart without knowing about fetch. */
export type Failure =
  | { type: 'network' } // time-out or no connection: the request may or may not have arrived
  | { type: 'auth' } // 401
  | { type: 'stale' } // 412 or 428
  | { type: 'rejected'; status: number; detail: string | null } // another 4xx: will fail again
  | { type: 'server'; status: number }; // 5xx: may pass later

export type RunResult = 'idle' | 'offline' | 'auth' | 'waiting';
