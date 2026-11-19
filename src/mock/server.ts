import type { Stop, Trip } from '../domain/trip';

// A stand-in for the backend, used only when EXPO_PUBLIC_MOCK=1. It lets every screen be seen and every step
// be tried on an emulator with no server. It keeps its data in memory (a restart of the app resets the trips),
// follows the same rules and error codes as the real API, and answers in the same shapes as MobileContracts.cs.
//
// Sign in with company code DEMO, any email, and the password demo1234.

export type MockReply = { status: number; body: unknown; etag?: string | null };
export type MockCall = {
  method: string;
  path: string;
  body: unknown;
  token: string | null;
  ifMatch: string | null;
  idempotencyKey: string | null;
};

const TENANT = { tenantId: 'mock-tenant', companyCode: 'DEMO', displayName: 'Demo Logistics (mock)' };
const HOUR = 3_600_000;
const iso = (ms: number) => new Date(ms).toISOString();

const ok = (body: unknown, etag?: string | null): MockReply => ({ status: 200, body, etag });
const problem = (status: number, code: string, detail: string): MockReply => ({
  status,
  body: { title: detail, detail, code, status },
});

// ---- data ---------------------------------------------------------------------------------------------------

let versionCounter = 1;
const nextVersion = () => `v${versionCounter++}`;

function stop(
  id: string,
  sequence: number,
  name: string,
  address: string,
  latitude: number,
  longitude: number,
  stopType: Stop['stopType'],
  plannedAt: number,
  patch: Partial<Stop> = {},
): Stop {
  return {
    id,
    sequence,
    reference: `REF-${id.toUpperCase()}`,
    name,
    address,
    latitude,
    longitude,
    serviceMinutes: 20,
    status: 'PLANNED',
    plannedArrivalAt: iso(plannedAt),
    actualArrivalAt: null,
    actualDepartureAt: null,
    podStatus: 'PENDING',
    stopType,
    loadIds: [`load-${id}`],
    ...patch,
  };
}

type Store = {
  trips: Map<string, Trip & { acknowledged: boolean }>;
  proofs: Map<string, { id: string; tripStopId: string; recipientName: string; deliveredAt: string }>;
  problems: Map<string, { id: string; type: string; severity: string; status: string; description: string }[]>;
  notes: Map<string, { id: string; at: string; by: string; text: string }[]>;
  loadChanges: Map<string, { id: string; action: string; status: string; reasonCode: string; reasonText: string }[]>;
  replies: Map<string, MockReply>;
  counter: number;
};

function seed(): Store {
  const now = Date.now();
  const base = {
    vehicleKey: 'TRK-014',
    driverKey: 'DRV-001',
    helperCount: 1,
    cancelReason: null,
    completedAt: null,
  };
  const a: Trip & { acknowledged: boolean } = {
    ...base,
    id: 'trip-a',
    tripNumber: 'TRP-2611-0101',
    name: 'Bangkok morning round',
    status: 'DISPATCHED',
    totalDistanceKm: 48.2,
    estimatedArrivalAt: iso(now + 5 * HOUR),
    scheduledStartAt: iso(now + HOUR),
    scheduledEndAt: iso(now + 6 * HOUR),
    startedAt: null,
    loadIds: ['load-a1', 'load-a2', 'load-a3'],
    stops: [
      stop('a1', 1, 'Lat Krabang warehouse', '9 Chalongkrung Rd, Lat Krabang', 13.7273, 100.7549, 'PICKUP', now + HOUR, {
        loadIds: ['load-a1'],
      }),
      stop('a2', 2, 'Siam Retail DC', '88 Bangna-Trad Rd, Bang Na', 13.6679, 100.6046, 'DELIVERY', now + 3 * HOUR, {
        loadIds: ['load-a2'],
      }),
      stop('a3', 3, 'Chao Phraya Mart', '12 Rama III Rd, Yan Nawa', 13.6982, 100.5287, 'DELIVERY', now + 5 * HOUR, {
        loadIds: ['load-a3'],
      }),
    ],
    version: nextVersion(),
    acknowledged: false,
  };
  const b: Trip & { acknowledged: boolean } = {
    ...base,
    id: 'trip-b',
    tripNumber: 'TRP-2611-0099',
    name: 'Samut Prakan afternoon',
    status: 'IN_TRANSIT',
    totalDistanceKm: 31.5,
    estimatedArrivalAt: iso(now + 2 * HOUR),
    scheduledStartAt: iso(now - 2 * HOUR),
    scheduledEndAt: iso(now + 3 * HOUR),
    startedAt: iso(now - 2 * HOUR),
    loadIds: ['load-b1', 'load-b2'],
    // Demo only: a hand-made bendy line, not a real road. It shows the road-route drawing; trip A has none, so the
    // dashed fallback can be seen too.
    routeGeometry: {
      type: 'LineString',
      coordinates: [
        [100.7121, 13.6074],
        [100.6932, 13.6061],
        [100.6905, 13.6128],
        [100.6711, 13.6119],
        [100.6698, 13.6046],
        [100.6402, 13.6031],
        [100.6217, 13.5974],
        [100.6089, 13.6012],
        [100.5968, 13.5991],
      ],
    },
    stops: [
      stop('b1', 1, 'Bang Phli depot', '55 Bang Na-Trad Km 18', 13.6074, 100.7121, 'PICKUP', now - HOUR, {
        status: 'DELIVERED',
        podStatus: 'CAPTURED',
        actualArrivalAt: iso(now - 100 * 60_000),
        actualDepartureAt: iso(now - 70 * 60_000),
        loadIds: ['load-b1'],
      }),
      stop('b2', 2, 'Pak Nam Foods', '3 Sukhumvit Rd, Samut Prakan', 13.5991, 100.5968, 'DELIVERY', now + HOUR, {
        status: 'ARRIVED',
        actualArrivalAt: iso(now - 10 * 60_000),
        loadIds: ['load-b2'],
      }),
    ],
    version: nextVersion(),
    acknowledged: true,
  };
  const c: Trip & { acknowledged: boolean } = {
    ...base,
    id: 'trip-c',
    tripNumber: 'TRP-2611-0120',
    name: 'Tomorrow, Nonthaburi',
    status: 'PLANNED',
    totalDistanceKm: 22.0,
    estimatedArrivalAt: iso(now + 30 * HOUR),
    scheduledStartAt: iso(now + 26 * HOUR),
    scheduledEndAt: iso(now + 31 * HOUR),
    startedAt: null,
    loadIds: ['load-c1'],
    stops: [
      stop('c1', 1, 'Nonthaburi hub', '77 Tiwanon Rd, Nonthaburi', 13.8621, 100.5144, 'DELIVERY', now + 28 * HOUR, {
        loadIds: ['load-c1'],
      }),
    ],
    version: nextVersion(),
    acknowledged: false,
  };
  return {
    trips: new Map([a, b, c].map((t) => [t.id, t])),
    proofs: new Map(),
    problems: new Map(),
    notes: new Map(),
    loadChanges: new Map(),
    replies: new Map(),
    counter: 1,
  };
}

let store = seed();

let simulatedOffline = false;

/** The settings switch in mock mode: every request then fails as it does with no signal. */
export function setMockOffline(value: boolean) {
  simulatedOffline = value;
}
export const isMockOffline = () => simulatedOffline;

/** Back to the starting data. */
export function resetMock() {
  store = seed();
}

// ---- helpers ------------------------------------------------------------------------------------------------

const summary = (t: Trip & { acknowledged: boolean }) => ({
  id: t.id,
  tripNumber: t.tripNumber,
  name: t.name,
  status: t.status,
  vehicleCode: t.vehicleKey,
  scheduledStartAt: t.scheduledStartAt,
  estimatedArrivalAt: t.estimatedArrivalAt,
  stopCount: t.stops.length,
  completedStopCount: t.stops.filter((s) => s.actualDepartureAt !== null).length,
  acknowledged: t.acknowledged,
  version: t.version,
});

const publicTrip = ({ acknowledged: _ack, ...t }: Trip & { acknowledged: boolean }): Trip => t;
const id = (prefix: string) => `${prefix}-${store.counter++}`;
const sorted = (t: Trip) => [...t.stops].sort((x, y) => x.sequence - y.sequence);

type Found = { trip: Trip & { acknowledged: boolean } };

function lookup(tripId: string): Found | MockReply {
  const trip = store.trips.get(tripId);
  return trip ? { trip } : problem(404, 'RESOURCE_NOT_FOUND', 'Trip not found');
}
const isReply = (x: Found | MockReply): x is MockReply => 'status' in x;

/** Every change to a trip checks the version the phone saw, then moves it on. */
function versionOk(trip: Trip, ifMatch: string | null): boolean {
  return !ifMatch || ifMatch.replace(/"/g, '') === trip.version;
}
const conflict = () => problem(412, 'VERSION_CONFLICT', 'The trip changed; read it again.');

/** A repeat of a keyed request gets the first answer back, as the real API does. */
function keyed(call: MockCall, run: () => MockReply): MockReply {
  if (!call.idempotencyKey) return run();
  const cacheKey = `${call.method} ${call.path} ${call.idempotencyKey}`;
  const seen = store.replies.get(cacheKey);
  if (seen) return seen;
  const reply = run();
  if (reply.status < 400) store.replies.set(cacheKey, reply);
  return reply;
}

const hasLeft = (s: Stop) => s.actualDepartureAt !== null;
const isOpen = (trip: Trip, stopId: string) => {
  for (const s of sorted(trip)) {
    if (s.id === stopId) return true;
    if (!hasLeft(s)) return false;
  }
  return false;
};

// ---- routes -------------------------------------------------------------------------------------------------

const account = {
  id: 'mock-driver',
  driverCode: 'DRV-001',
  email: 'driver@demo.test',
  displayName: 'Somchai Demo',
  active: true,
  lockedUntil: null,
  lastLoginAt: null,
  version: 'a1',
};

function session(): MockReply {
  return ok({ accessToken: `mock-${Date.now()}-${store.counter++}`, expiresAt: iso(Date.now() + 12 * HOUR), account });
}

export function handleMock(call: MockCall): MockReply {
  const { method, body } = call;
  const path = call.path.split('?')[0];
  const b = (body ?? {}) as Record<string, unknown>;
  let m: RegExpMatchArray | null;

  // ---- sign in (no token yet)
  if ((m = path.match(/^\/mobile\/tenants\/resolve\/(.+)$/)) && method === 'GET') {
    return decodeURIComponent(m[1]).toUpperCase() === TENANT.companyCode
      ? ok(TENANT)
      : problem(404, 'RESOURCE_NOT_FOUND', 'Unknown company code. In mock mode use DEMO.');
  }
  if (path === '/mobile/auth/login' && method === 'POST') {
    return b.password === 'demo1234' ? session() : problem(401, 'INVALID_CREDENTIALS', 'Wrong email or password. In mock mode the password is demo1234.');
  }
  if (!call.token) return problem(401, 'UNAUTHORIZED', 'Sign in first');
  if (path === '/mobile/auth/refresh' && method === 'POST') return session();
  if (path === '/mobile/auth/logout' && method === 'POST') return { status: 204, body: undefined };

  // ---- device and list
  if (path === '/mobile/me/sync' && method === 'GET') {
    return ok({ serverTime: iso(Date.now()), trips: [...store.trips.values()].map(summary), devices: [] });
  }
  if (path === '/mobile/me/devices' && method === 'POST') return { status: 204, body: undefined };

  // ---- photo of a proof
  if (path.match(/^\/mobile\/me\/proofs\/[^/]+\/documents$/) && method === 'POST') {
    return { status: 201, body: { id: id('doc') } };
  }

  // ---- everything under one trip
  const tm = path.match(/^\/mobile\/me\/trips\/([^/]+)(\/.*)?$/);
  if (!tm) return problem(404, 'RESOURCE_NOT_FOUND', `No mock for ${method} ${path}`);
  const found = lookup(tm[1]);
  if (isReply(found)) return found;
  const trip = found.trip;
  const rest = tm[2] ?? '';

  if (rest === '' && method === 'GET') return ok(publicTrip(trip));

  if (rest === '/acknowledge' && method === 'POST') {
    trip.acknowledged = true;
    if (b.accepted === false) {
      trip.status = 'CANCELLED';
      trip.cancelReason = String(b.reason ?? 'Rejected by driver');
    }
    trip.version = nextVersion();
    return { status: 204, body: undefined };
  }

  if (rest === '/start' && method === 'POST') {
    return keyed(call, () => {
      if (!versionOk(trip, call.ifMatch)) return conflict();
      if (trip.status !== 'DISPATCHED') return problem(409, 'TRIP_STATE_INVALID', 'Only a dispatched trip can start.');
      trip.status = 'IN_TRANSIT';
      trip.startedAt = String(b.occurredAt ?? iso(Date.now()));
      trip.version = nextVersion();
      return ok(publicTrip(trip), `"${trip.version}"`);
    });
  }

  if (rest === '/complete' && method === 'POST') {
    return keyed(call, () => {
      if (!versionOk(trip, call.ifMatch)) return conflict();
      if (trip.status !== 'IN_TRANSIT') return problem(409, 'TRIP_STATE_INVALID', 'Only a trip on the road can complete.');
      if (trip.stops.some((s) => s.podStatus !== 'CAPTURED')) return problem(422, 'POD_REQUIRED', 'Every stop needs proof first.');
      trip.status = 'DELIVERED';
      trip.completedAt = String(b.occurredAt ?? iso(Date.now()));
      trip.version = nextVersion();
      return ok(publicTrip(trip), `"${trip.version}"`);
    });
  }

  if (rest === '/tracking-events/batch' && method === 'POST') return { status: 204, body: undefined };

  if (rest === '/exceptions') {
    const list = store.problems.get(trip.id) ?? [];
    if (method === 'GET') return ok(list);
    const row = { id: id('exc'), type: String(b.type), severity: String(b.severity), status: 'OPEN', description: String(b.description ?? '') };
    store.problems.set(trip.id, [...list, row]);
    return { status: 201, body: row };
  }
  if (rest === '/notes') {
    const list = store.notes.get(trip.id) ?? [];
    if (method === 'GET') return ok(list);
    const row = { id: id('note'), at: iso(Date.now()), by: account.displayName, text: String(b.text ?? '') };
    store.notes.set(trip.id, [...list, row]);
    return { status: 201, body: row };
  }
  if (rest === '/load-changes') {
    const list = store.loadChanges.get(trip.id) ?? [];
    if (method === 'GET') return ok(list);
    return keyed(call, () => {
      const row = {
        id: id('lc'),
        action: String(b.action ?? 'REMOVE'),
        status: 'PENDING',
        reasonCode: String(b.reasonCode ?? ''),
        reasonText: String(b.reasonText ?? ''),
      };
      store.loadChanges.set(trip.id, [...list, row]);
      return { status: 201, body: row };
    });
  }

  // ---- one stop
  const sm = rest.match(/^\/stops\/([^/]+)\/(arrival-status|check-in|check-out|proof-of-delivery)$/);
  if (!sm) return problem(404, 'RESOURCE_NOT_FOUND', `No mock for ${method} ${path}`);
  const target = trip.stops.find((s) => s.id === sm[1]);
  if (!target) return problem(404, 'RESOURCE_NOT_FOUND', 'Stop not found');

  if (sm[2] === 'arrival-status' && method === 'GET') {
    // The mock cannot know where the emulator is, so it always says the vehicle is at the stop.
    return ok({ tripId: trip.id, stopId: target.id, distanceMeters: 40, arrivalGeofenceMeters: 200, gpsFresh: true, canCheckIn: true });
  }

  if (sm[2] === 'proof-of-delivery' && method === 'GET') {
    const proof = [...store.proofs.values()].find((p) => p.tripStopId === target.id);
    return proof ? ok(proof) : problem(404, 'RESOURCE_NOT_FOUND', 'No proof yet');
  }

  if (method !== 'POST') return problem(404, 'RESOURCE_NOT_FOUND', `No mock for ${method} ${path}`);
  const refused = (): MockReply | null => {
    if (!versionOk(trip, call.ifMatch)) return conflict();
    if (trip.status !== 'IN_TRANSIT') return problem(409, 'TRIP_STATE_INVALID', 'The trip is not on the road.');
    return null;
  };

  if (sm[2] !== 'proof-of-delivery') {
    const no = refused();
    if (no) return no;
  }

  if (sm[2] === 'check-in') {
    if (target.status !== 'PLANNED') return problem(409, 'STOP_ALREADY_ARRIVED', 'Already checked in.');
    if (!isOpen(trip, target.id)) return problem(409, 'PREVIOUS_STOP_INCOMPLETE', 'An earlier stop is not finished.');
    target.status = 'ARRIVED';
    target.actualArrivalAt = String(b.occurredAt ?? iso(Date.now()));
  } else if (sm[2] === 'check-out') {
    if (target.status === 'PLANNED') return problem(409, 'STOP_NOT_ARRIVED', 'Check in first.');
    target.status = target.podStatus === 'CAPTURED' ? 'DELIVERED' : 'DEPARTED';
    target.actualDepartureAt = String(b.occurredAt ?? iso(Date.now()));
  } else {
    return keyed(call, () => {
      const no = refused();
      if (no) return no;
      if (target.status === 'PLANNED') return problem(409, 'STOP_NOT_ARRIVED', 'Check in first.');
      if (target.podStatus === 'CAPTURED') return problem(409, 'POD_ALREADY_CAPTURED', 'Proof already saved.');
      const proof = {
        id: id('pod'),
        tripStopId: target.id,
        recipientName: String(b.recipientName ?? ''),
        deliveredAt: String(b.deliveredAt ?? iso(Date.now())),
      };
      store.proofs.set(proof.id, proof);
      target.podStatus = 'CAPTURED';
      target.status = 'DELIVERED';
      trip.version = nextVersion();
      return { status: 201, body: proof, etag: `"${trip.version}"` };
    });
  }
  trip.version = nextVersion();
  return ok(publicTrip(trip), `"${trip.version}"`);
}
