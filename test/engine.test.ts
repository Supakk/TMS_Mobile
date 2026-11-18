import { ApiError, UnknownOutcomeError } from '../src/api/client';
import type { Command } from '../src/domain/commands';
import type { Stop, Trip } from '../src/domain/trip';
import { backoffMs, createEngine } from '../src/offline/engine';
import type { EngineApi, OfflineStore, OutboxRow, TrackingSample } from '../src/offline/types';

const ACCOUNT = 'acc-1';

const stop = (sequence: number, patch: Partial<Stop> = {}): Stop => ({
  id: `s${sequence}`,
  sequence,
  reference: `R${sequence}`,
  name: `Stop ${sequence}`,
  address: '',
  latitude: 13.7,
  longitude: 100.5,
  serviceMinutes: 10,
  status: 'PLANNED',
  plannedArrivalAt: null,
  actualArrivalAt: null,
  actualDepartureAt: null,
  podStatus: 'PENDING',
  stopType: 'DELIVERY',
  loadIds: null,
  ...patch,
});

const baseTrip = (patch: Partial<Trip> = {}): Trip => ({
  id: 't1',
  tripNumber: 'T-1',
  name: 'Trip',
  status: 'DISPATCHED',
  vehicleKey: null,
  driverKey: null,
  helperCount: null,
  totalDistanceKm: null,
  estimatedArrivalAt: null,
  scheduledStartAt: null,
  scheduledEndAt: null,
  startedAt: null,
  completedAt: null,
  cancelReason: null,
  loadIds: [],
  stops: [stop(1), stop(2)],
  version: 'v1',
  ...patch,
});

class FakeStore implements OfflineStore {
  rows: OutboxRow[] = [];
  trips = new Map<string, Trip>();
  samples: TrackingSample[] = [];
  seq = 0;
  async listRows() {
    return this.rows.map((r) => ({ ...r }));
  }
  async insertRow(row: OutboxRow) {
    // Like the real store: the order number is assigned here, whatever the row says.
    this.rows.push({ ...row, seq: Math.max(0, ...this.rows.map((r) => r.seq)) + 1 });
  }
  async updateRow(id: string, patch: Partial<OutboxRow>) {
    this.rows = this.rows.map((r) => (r.id === id ? { ...r, ...patch } : r));
  }
  async deleteRow(id: string) {
    this.rows = this.rows.filter((r) => r.id !== id);
  }
  async nextSeq() {
    return ++this.seq;
  }
  async getTrip(id: string) {
    return this.trips.get(id) ?? null;
  }
  async saveTrip(trip: Trip) {
    this.trips.set(trip.id, trip);
  }
  async addSamples(samples: TrackingSample[]) {
    this.samples.push(...samples);
  }
  async listSamples(accountId: string, tripId: string, limit: number) {
    return this.samples.filter((s) => s.accountId === accountId && s.tripId === tripId).slice(0, limit);
  }
  async deleteSamples(ids: string[]) {
    this.samples = this.samples.filter((s) => !ids.includes(s.clientEventId));
  }
  async deleteSamplesBefore(accountId: string, iso: string) {
    this.samples = this.samples.filter((s) => !(s.accountId === accountId && s.occurredAt < iso));
  }
  async sampleTripIds(accountId: string) {
    return [...new Set(this.samples.filter((s) => s.accountId === accountId).map((s) => s.tripId))];
  }
}

let clock = 1_000_000;
const now = () => clock;

async function enqueue(store: FakeStore, command: Command, patch: Partial<OutboxRow> = {}) {
  const seq = await store.nextSeq();
  await store.insertRow({
    id: `row-${seq}`,
    accountId: ACCOUNT,
    tripId: 't1',
    seq,
    command,
    idempotencyKey: `key-${seq}`,
    status: 'pending',
    attempts: 0,
    nextAttemptAt: 0,
    error: null,
    createdAt: now(),
    ...patch,
  });
}

const timeout = () => new UnknownOutcomeError('req');
const http = (status: number, detail?: string, code?: string) =>
  new ApiError(status, detail || code ? { detail, code } : null, 'req');

/** An API that behaves like the server: it keeps a trip, checks If-Match and bumps the version. */
function fakeServer(initial: Trip) {
  let trip = initial;
  let version = 1;
  const calls: string[] = [];
  const log = (name: string) => calls.push(name);
  const bump = (next: Trip): Trip => {
    version += 1;
    trip = { ...next, version: `v${version}` };
    return trip;
  };
  const check = (given: string) => {
    if (given !== trip.version) throw http(412);
  };
  const api: EngineApi & { calls: string[]; failNext: (error: unknown) => void } = {
    calls,
    failNext(error) {
      pending = error;
    },
    async fetchTrip() {
      log('fetchTrip');
      return trip;
    },
    async fetchProofId() {
      return 'proof-1';
    },
    async startTrip(_id, v, _k, at) {
      log('start');
      fail();
      check(v);
      return bump({ ...trip, status: 'IN_TRANSIT', startedAt: at });
    },
    async completeTrip(_id, v, _k, at) {
      log('complete');
      fail();
      check(v);
      return bump({ ...trip, status: 'DELIVERED', completedAt: at });
    },
    async checkIn(_id, stopId, v, body) {
      log(`checkIn:${stopId}`);
      fail();
      check(v);
      return bump({
        ...trip,
        stops: trip.stops.map((s) => (s.id === stopId ? { ...s, status: 'ARRIVED', actualArrivalAt: body.occurredAt } : s)),
      });
    },
    async checkOut(_id, stopId, v, at) {
      log(`checkOut:${stopId}`);
      fail();
      check(v);
      return bump({
        ...trip,
        stops: trip.stops.map((s) => (s.id === stopId ? { ...s, status: 'DEPARTED', actualDepartureAt: at } : s)),
      });
    },
    async captureProof(_id, stopId, v) {
      log(`pod:${stopId}`);
      fail();
      check(v);
      bump({
        ...trip,
        stops: trip.stops.map((s) => (s.id === stopId ? { ...s, status: 'DELIVERED', podStatus: 'CAPTURED' } : s)),
      });
      return { proofId: 'proof-1', version: trip.version };
    },
    async uploadPhoto(proofId, _p, clientDocumentId) {
      log(`photo:${proofId}:${clientDocumentId}`);
      fail();
    },
    async acknowledge() {
      log('ack');
      fail();
    },
    async reportProblem() {
      log('problem');
      fail();
    },
    async addNote() {
      log('note');
      fail();
    },
    async requestLoadRemoval() {
      log('load');
      fail();
    },
    async sendTracking(_id, items) {
      log(`tracking:${items.length}`);
      fail();
    },
  };
  let pending: unknown = null;
  function fail() {
    if (pending) {
      const error = pending;
      pending = null;
      throw error;
    }
  }
  return { api, get trip() { return trip; } };
}

const engineFor = (store: FakeStore, api: EngineApi) => createEngine(store, api, { now, newKey: () => `k${++clock}` });
const statuses = (store: FakeStore) => store.rows.map((r) => `${r.command.kind}:${r.status}`);

beforeEach(() => {
  clock = 1_000_000;
});

describe('sending in order', () => {
  it('sends a whole chain, each command with the version the last one returned', async () => {
    const server = fakeServer(baseTrip());
    const store = new FakeStore();
    await store.saveTrip(server.trip);
    await enqueue(store, { kind: 'START', occurredAt: 't' });
    await enqueue(store, { kind: 'CHECK_IN', stopId: 's1', occurredAt: 't', manualOverride: false, overrideReason: null });
    await enqueue(store, { kind: 'CHECK_OUT', stopId: 's1', occurredAt: 't' });

    expect(await engineFor(store, server.api).run(ACCOUNT)).toBe('idle');

    expect(server.api.calls).toEqual(['start', 'checkIn:s1', 'checkOut:s1']);
    expect(statuses(store)).toEqual(['START:done', 'CHECK_IN:done', 'CHECK_OUT:done']);
    expect(store.trips.get('t1')?.version).toBe(server.trip.version);
  });

  it('never sends another driver\'s rows', async () => {
    const server = fakeServer(baseTrip());
    const store = new FakeStore();
    await store.saveTrip(server.trip);
    await enqueue(store, { kind: 'START', occurredAt: 't' }, { accountId: 'someone-else' });
    await engineFor(store, server.api).run(ACCOUNT);
    expect(server.api.calls).toEqual([]);
    expect(statuses(store)).toEqual(['START:pending']);
  });
});

describe('losing the connection', () => {
  it('keeps the row and stops the run on a time-out, then sends after the backoff', async () => {
    const server = fakeServer(baseTrip());
    const store = new FakeStore();
    await store.saveTrip(server.trip);
    await enqueue(store, { kind: 'START', occurredAt: 't' });
    await enqueue(store, { kind: 'CHECK_IN', stopId: 's1', occurredAt: 't', manualOverride: false, overrideReason: null });

    server.api.failNext(timeout());
    const engine = engineFor(store, server.api);
    expect(await engine.run(ACCOUNT)).toBe('offline');
    expect(server.api.calls).toEqual(['start']); // the second row was not tried
    expect(statuses(store)).toEqual(['START:pending', 'CHECK_IN:pending']);
    expect(store.rows[0].attempts).toBe(1);
    expect(store.rows[0].nextAttemptAt).toBe(now() + backoffMs(0));

    // Too early: nothing is sent.
    expect(await engine.run(ACCOUNT)).toBe('waiting');
    expect(server.api.calls).toEqual(['start']);

    clock += backoffMs(0) + 1;
    expect(await engine.run(ACCOUNT)).toBe('idle');
    expect(statuses(store)).toEqual(['START:done', 'CHECK_IN:done']);
  });

  it('reuses the same idempotency key on the retry', async () => {
    const keys: string[] = [];
    const server = fakeServer(baseTrip());
    const original = server.api.startTrip;
    server.api.startTrip = async (id, v, key, at) => {
      keys.push(key);
      return original(id, v, key, at);
    };
    const store = new FakeStore();
    await store.saveTrip(server.trip);
    await enqueue(store, { kind: 'START', occurredAt: 't' });
    server.api.failNext(timeout());
    const engine = engineFor(store, server.api);
    await engine.run(ACCOUNT);
    clock += 60_000;
    await engine.run(ACCOUNT);
    expect(keys).toEqual(['key-1', 'key-1']);
  });

  it('stops on a 401 and keeps every row', async () => {
    const server = fakeServer(baseTrip());
    const store = new FakeStore();
    await store.saveTrip(server.trip);
    await enqueue(store, { kind: 'START', occurredAt: 't' });
    server.api.failNext(http(401));
    expect(await engineFor(store, server.api).run(ACCOUNT)).toBe('auth');
    expect(statuses(store)).toEqual(['START:pending']);
  });

  it('puts a row left "sending" by a crash back to pending and sends it', async () => {
    const server = fakeServer(baseTrip());
    const store = new FakeStore();
    await store.saveTrip(server.trip);
    await enqueue(store, { kind: 'START', occurredAt: 't' }, { status: 'sending' });
    await engineFor(store, server.api).run(ACCOUNT);
    expect(statuses(store)).toEqual(['START:done']);
  });
});

describe('the answer was lost (412 on a retry)', () => {
  it('counts a check-in as done when the server already shows the stop as arrived', async () => {
    const arrived = baseTrip({
      status: 'IN_TRANSIT',
      version: 'v9',
      stops: [stop(1, { status: 'ARRIVED', actualArrivalAt: 'earlier' }), stop(2)],
    });
    const server = fakeServer(arrived);
    const store = new FakeStore();
    // Our copy is old: it still shows the stop as planned, so the send gets a 412.
    await store.saveTrip(baseTrip({ status: 'IN_TRANSIT', version: 'v1' }));
    await enqueue(store, { kind: 'CHECK_IN', stopId: 's1', occurredAt: 't', manualOverride: false, overrideReason: null });
    await engineFor(store, server.api).run(ACCOUNT);
    expect(statuses(store)).toEqual(['CHECK_IN:done']);
    // One try gets the 412; the re-read shows the arrival, so the command is not sent a second time.
    expect(server.api.calls).toEqual(['checkIn:s1', 'fetchTrip']);
  });

  it('retries once with the fresh version when the trip changed but the step is still needed', async () => {
    const changed = baseTrip({ status: 'IN_TRANSIT', version: 'v7' });
    const server = fakeServer(changed);
    const store = new FakeStore();
    await store.saveTrip(baseTrip({ status: 'IN_TRANSIT', version: 'v1' }));
    await enqueue(store, { kind: 'CHECK_IN', stopId: 's1', occurredAt: 't', manualOverride: false, overrideReason: null });
    await engineFor(store, server.api).run(ACCOUNT);
    expect(server.api.calls).toEqual(['checkIn:s1', 'fetchTrip', 'checkIn:s1']);
    expect(statuses(store)).toEqual(['CHECK_IN:done']);
  });
});

describe('a command the server refuses', () => {
  it('marks it failed with the reason and blocks the rows behind it', async () => {
    const server = fakeServer(baseTrip({ status: 'IN_TRANSIT' }));
    const store = new FakeStore();
    await store.saveTrip(server.trip);
    await enqueue(store, { kind: 'CHECK_IN', stopId: 's1', occurredAt: 't', manualOverride: false, overrideReason: null });
    await enqueue(store, { kind: 'CHECK_OUT', stopId: 's1', occurredAt: 't' });
    server.api.failNext(http(422, 'A recent GPS position within the stop geofence is required to check in.'));

    const engine = engineFor(store, server.api);
    await engine.run(ACCOUNT);
    expect(statuses(store)).toEqual(['CHECK_IN:failed', 'CHECK_OUT:pending']);
    expect(store.rows[0].error).toEqual({
      code: 'HTTP_422',
      detail: 'A recent GPS position within the stop geofence is required to check in.',
    });

    await engine.run(ACCOUNT);
    expect(server.api.calls).toEqual(['checkIn:s1']); // the check-out was never tried
  });

  it('does not let one trip\'s failure block another trip', async () => {
    const server = fakeServer(baseTrip());
    const store = new FakeStore();
    await store.saveTrip(server.trip);
    await enqueue(store, { kind: 'START', occurredAt: 't' }, { tripId: 'other' });
    await enqueue(store, { kind: 'START', occurredAt: 't' });
    await store.saveTrip(baseTrip({ id: 'other' }));
    server.api.failNext(http(409, 'nope'));
    await engineFor(store, server.api).run(ACCOUNT);
    expect(statuses(store)).toEqual(['START:failed', 'START:done']);
  });

  it('retries a 5xx later and gives up after several attempts', async () => {
    const server = fakeServer(baseTrip());
    const store = new FakeStore();
    await store.saveTrip(server.trip);
    await enqueue(store, { kind: 'START', occurredAt: 't' });
    const engine = engineFor(store, server.api);
    for (let i = 0; i < 6; i++) {
      server.api.failNext(http(500));
      await engine.run(ACCOUNT);
      clock += 600_000;
    }
    expect(statuses(store)).toEqual(['START:failed']);
  });
});

describe('proof of delivery', () => {
  const photo = { uri: 'file:///p.jpg', name: 'p.jpg', mimeType: 'image/jpeg' };
  const pod: Command = {
    kind: 'POD',
    stopId: 's1',
    recipientName: 'Somchai',
    deliveredAt: 't',
    notes: null,
    photo,
    clientDocumentId: 'doc-1',
  };

  it('creates the proof, then uploads the photo with its stable document id', async () => {
    const server = fakeServer(baseTrip({ status: 'IN_TRANSIT', stops: [stop(1, { status: 'ARRIVED' }), stop(2)] }));
    const store = new FakeStore();
    await store.saveTrip(server.trip);
    await enqueue(store, pod);
    await engineFor(store, server.api).run(ACCOUNT);
    expect(server.api.calls).toEqual(['pod:s1', 'photo:proof-1:doc-1']);
    expect(statuses(store)).toEqual(['POD:done', 'POD_PHOTO:done']);
  });

  it('keeps the photo when its upload fails, without repeating the proof', async () => {
    const server = fakeServer(baseTrip({ status: 'IN_TRANSIT', stops: [stop(1, { status: 'ARRIVED' }), stop(2)] }));
    const store = new FakeStore();
    await store.saveTrip(server.trip);
    await enqueue(store, pod);
    const engine = engineFor(store, server.api);

    // Let the proof through, fail the photo.
    const upload = server.api.uploadPhoto;
    let first = true;
    server.api.uploadPhoto = async (...args) => {
      if (first) {
        first = false;
        throw timeout();
      }
      return upload(...args);
    };
    expect(await engine.run(ACCOUNT)).toBe('offline');
    expect(statuses(store)).toEqual(['POD:done', 'POD_PHOTO:pending']);

    clock += 60_000;
    await engine.run(ACCOUNT);
    expect(statuses(store)).toEqual(['POD:done', 'POD_PHOTO:done']);
    expect(server.api.calls.filter((c) => c.startsWith('pod:'))).toHaveLength(1);
  });

  it('does not wait for the photo to check out', async () => {
    const server = fakeServer(baseTrip({ status: 'IN_TRANSIT', stops: [stop(1, { status: 'ARRIVED' }), stop(2)] }));
    const store = new FakeStore();
    await store.saveTrip(server.trip);
    await enqueue(store, pod);
    await enqueue(store, { kind: 'CHECK_OUT', stopId: 's1', occurredAt: 't' });
    server.api.uploadPhoto = async () => {
      throw timeout();
    };
    await engineFor(store, server.api).run(ACCOUNT);
    expect(server.api.calls).toContain('checkOut:s1');
  });
});

describe('requests that do not change the trip', () => {
  it('sends notes, problems and load requests independently', async () => {
    const server = fakeServer(baseTrip());
    const store = new FakeStore();
    await store.saveTrip(server.trip);
    await enqueue(store, { kind: 'NOTE', text: 'hi' });
    await enqueue(store, { kind: 'PROBLEM', type: 'DELAY', severity: 'LOW', description: 'traffic' });
    await enqueue(store, { kind: 'LOAD_REQUEST', loadId: 'l1', reasonCode: 'DAMAGED', reasonText: null });
    await engineFor(store, server.api).run(ACCOUNT);
    expect(server.api.calls).toEqual(['note', 'problem', 'load']);
  });
});

describe('GPS samples', () => {
  const sample = (id: string): TrackingSample => ({
    clientEventId: id,
    tripId: 't1',
    accountId: ACCOUNT,
    eventType: 'GPS',
    occurredAt: 't',
    latitude: 13,
    longitude: 100,
    speedKph: 0,
  });

  it('goes before the trip commands, in batches of up to 100, and is deleted once accepted', async () => {
    const server = fakeServer(baseTrip());
    const store = new FakeStore();
    await store.saveTrip(server.trip);
    await store.addSamples(Array.from({ length: 150 }, (_, i) => sample(`e${i}`)));
    await enqueue(store, { kind: 'START', occurredAt: 't' });
    await engineFor(store, server.api).run(ACCOUNT);
    expect(server.api.calls).toEqual(['tracking:100', 'tracking:50', 'start']);
    expect(store.samples).toHaveLength(0);
  });

  it('keeps the samples when offline and drops a single point the server calls invalid', async () => {
    const server = fakeServer(baseTrip());
    const store = new FakeStore();
    await store.saveTrip(server.trip);
    await store.addSamples([sample('a')]);
    const engine = engineFor(store, server.api);

    server.api.failNext(timeout());
    expect(await engine.run(ACCOUNT)).toBe('offline');
    expect(store.samples).toHaveLength(1);

    server.api.failNext(http(400, 'implausible GPS jump', 'INVALID_REQUEST'));
    await engine.run(ACCOUNT);
    expect(store.samples).toHaveLength(0);
  });
});

describe('GPS batch with one bad point', () => {
  const point = (id: string): TrackingSample => ({
    clientEventId: id,
    tripId: 't1',
    accountId: ACCOUNT,
    eventType: 'GPS',
    occurredAt: id,
    latitude: 13,
    longitude: 100,
    speedKph: 0,
  });

  it('drops only the refused point and still sends the good ones', async () => {
    const server = fakeServer(baseTrip());
    const store = new FakeStore();
    await store.saveTrip(server.trip);
    await store.addSamples(['a', 'b', 'bad', 'd', 'e'].map(point));
    const sent: string[] = [];
    server.api.sendTracking = async (_id, items) => {
      if (items.some((i) => i.clientEventId === 'bad')) throw http(400, 'implausible GPS jump', 'INVALID_REQUEST');
      sent.push(...items.map((i) => i.clientEventId));
    };
    await engineFor(store, server.api).run(ACCOUNT);
    expect(sent.sort()).toEqual(['a', 'b', 'd', 'e']);
    expect(store.samples).toHaveLength(0);
  });
});

describe('order numbers', () => {
  it('gives every row its own number when many are made at once', async () => {
    const store = new FakeStore();
    await Promise.all(
      Array.from({ length: 5 }, (_, i) => enqueue(store, { kind: 'NOTE', text: String(i) })),
    );
    const numbers = store.rows.map((r) => r.seq);
    expect(new Set(numbers).size).toBe(5);
  });
});

describe('GPS refused for a reason that is not a bad point', () => {
  const sample = (id: string, tripId = 't1', occurredAt = 'now'): TrackingSample => ({
    clientEventId: id,
    tripId,
    accountId: ACCOUNT,
    eventType: 'GPS',
    occurredAt,
    latitude: 13,
    longitude: 100,
    speedKph: 0,
  });

  it.each([
    [403, 'ACCESS_DENIED'],
    [404, 'RESOURCE_NOT_FOUND'],
    [409, 'REQUEST_CONFLICT'],
    [412, 'VERSION_CONFLICT'],
    [422, 'BUSINESS_RULE_REJECTED'],
    [400, undefined], // a 400 without the code is not proof of a bad point either
  ])('keeps every sample on a %s and does not split the batch', async (status, code) => {
    const server = fakeServer(baseTrip());
    const store = new FakeStore();
    await store.addSamples(['a', 'b', 'c'].map((id) => sample(id)));
    const attempts: number[] = [];
    server.api.sendTracking = async (_id, items) => {
      attempts.push(items.length);
      throw http(status, 'refused', code);
    };
    await engineFor(store, server.api).run(ACCOUNT);
    expect(attempts).toEqual([3]); // one try, no halving
    expect(store.samples).toHaveLength(3);
  });

  it('does not ask again until the wait is over, then waits longer each time', async () => {
    const server = fakeServer(baseTrip());
    const store = new FakeStore();
    await store.addSamples([sample('a')]);
    let asked = 0;
    server.api.sendTracking = async () => {
      asked += 1;
      throw http(404, 'gone', 'RESOURCE_NOT_FOUND');
    };
    const engine = engineFor(store, server.api);

    await engine.run(ACCOUNT);
    await engine.run(ACCOUNT); // woken again at once: held back
    await engine.run(ACCOUNT);
    expect(asked).toBe(1);

    clock += 31_000; // the first wait is 30 s
    await engine.run(ACCOUNT);
    expect(asked).toBe(2);

    clock += 31_000; // the second wait is 60 s: not over yet
    await engine.run(ACCOUNT);
    expect(asked).toBe(2);

    clock += 31_000;
    await engine.run(ACCOUNT);
    expect(asked).toBe(3);
    expect(store.samples).toHaveLength(1); // still kept
  });

  it('holds back only the refused trip and sends the others', async () => {
    const server = fakeServer(baseTrip());
    const store = new FakeStore();
    await store.addSamples([sample('a', 'gone'), sample('b', 't1')]);
    const sent: string[] = [];
    server.api.sendTracking = async (tripId, items) => {
      if (tripId === 'gone') throw http(404, 'gone', 'RESOURCE_NOT_FOUND');
      sent.push(...items.map((i) => i.clientEventId));
    };
    await engineFor(store, server.api).run(ACCOUNT);
    expect(sent).toEqual(['b']);
    expect(store.samples.map((s) => s.clientEventId)).toEqual(['a']);
  });

  it('lets trip commands go on while the GPS of a trip is held back', async () => {
    const server = fakeServer(baseTrip());
    const store = new FakeStore();
    await store.saveTrip(server.trip);
    await store.addSamples([sample('a')]);
    await enqueue(store, { kind: 'START', occurredAt: 't' });
    server.api.sendTracking = async () => {
      throw http(422, 'no', 'BUSINESS_RULE_REJECTED');
    };
    await engineFor(store, server.api).run(ACCOUNT);
    expect(statuses(store)).toEqual(['START:done']);
  });

  it('keeps the samples when the server is busy (429)', async () => {
    const server = fakeServer(baseTrip());
    const store = new FakeStore();
    await store.addSamples([sample('a')]);
    server.api.sendTracking = async () => {
      throw http(429);
    };
    await engineFor(store, server.api).run(ACCOUNT);
    expect(store.samples).toHaveLength(1);
  });

  it('throws away samples older than three days so a refused trip cannot fill the phone', async () => {
    const server = fakeServer(baseTrip());
    const store = new FakeStore();
    clock = Date.UTC(2026, 10, 18);
    const old = new Date(clock - 4 * 24 * 3600 * 1000).toISOString();
    const recent = new Date(clock - 3600 * 1000).toISOString();
    await store.addSamples([sample('old', 't1', old), sample('recent', 't1', recent)]);
    server.api.sendTracking = async () => {
      throw timeout();
    };
    await engineFor(store, server.api).run(ACCOUNT);
    expect(store.samples.map((s) => s.clientEventId)).toEqual(['recent']);
  });
});

describe('machine-readable codes', () => {
  it('stores the server code on a failed row so the screen can translate it', async () => {
    const server = fakeServer(baseTrip({ status: 'IN_TRANSIT' }));
    const store = new FakeStore();
    await store.saveTrip(server.trip);
    await enqueue(store, { kind: 'CHECK_IN', stopId: 's1', occurredAt: 't', manualOverride: false, overrideReason: null });
    server.api.failNext(http(422, 'A recent GPS position is required', 'GEOFENCE_REQUIRED'));
    await engineFor(store, server.api).run(ACCOUNT);
    expect(store.rows[0].error).toEqual({ code: 'GEOFENCE_REQUIRED', detail: 'A recent GPS position is required' });
  });

  it('treats "already arrived" as a reason to look again, and counts the row as done when it is true', async () => {
    const arrived = baseTrip({
      status: 'IN_TRANSIT',
      version: 'v9',
      stops: [stop(1, { status: 'ARRIVED', actualArrivalAt: 'earlier' }), stop(2)],
    });
    const server = fakeServer(arrived);
    const store = new FakeStore();
    // Same version as the server, so there is no 412: the code alone sends it to look again.
    await store.saveTrip(baseTrip({ status: 'IN_TRANSIT', version: 'v9' }));
    await enqueue(store, { kind: 'CHECK_IN', stopId: 's1', occurredAt: 't', manualOverride: false, overrideReason: null });
    server.api.failNext(http(422, 'already', 'STOP_ALREADY_ARRIVED'));
    await engineFor(store, server.api).run(ACCOUNT);
    expect(statuses(store)).toEqual(['CHECK_IN:done']);
  });

  it('treats VERSION_CONFLICT like a 412: re-read and retry once', async () => {
    const server = fakeServer(baseTrip({ status: 'IN_TRANSIT', version: 'v7' }));
    const store = new FakeStore();
    await store.saveTrip(baseTrip({ status: 'IN_TRANSIT', version: 'v7' }));
    await enqueue(store, { kind: 'CHECK_IN', stopId: 's1', occurredAt: 't', manualOverride: false, overrideReason: null });
    server.api.failNext(http(409, 'conflict', 'VERSION_CONFLICT'));
    await engineFor(store, server.api).run(ACCOUNT);
    expect(statuses(store)).toEqual(['CHECK_IN:done']);
  });

  it('retries a busy server (429) on a row later instead of failing it', async () => {
    const server = fakeServer(baseTrip());
    const store = new FakeStore();
    await store.saveTrip(server.trip);
    await enqueue(store, { kind: 'START', occurredAt: 't' });
    server.api.failNext(http(429));
    await engineFor(store, server.api).run(ACCOUNT);
    expect(statuses(store)).toEqual(['START:pending']);
  });
});
