import { applyCommand, asManualCheckIn, effectApplied, isTripCommand, projectTrip, type Command } from '../src/domain/commands';
import { ARRIVAL_GEOFENCE_METERS, distanceMeters, localArrival } from '../src/domain/geo';
import { stopActions, type Stop, type Trip } from '../src/domain/trip';

const stop = (sequence: number, patch: Partial<Stop> = {}): Stop => ({
  id: `s${sequence}`,
  sequence,
  reference: '',
  name: '',
  address: '',
  latitude: 13.7563,
  longitude: 100.5018,
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

const trip = (patch: Partial<Trip> = {}): Trip => ({
  id: 't1',
  tripNumber: 'T-1',
  name: '',
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

const checkIn = (stopId: string): Command => ({
  kind: 'CHECK_IN',
  stopId,
  occurredAt: '2026-11-18T01:00:00Z',
  manualOverride: false,
  overrideReason: null,
});
const checkOut = (stopId: string): Command => ({ kind: 'CHECK_OUT', stopId, occurredAt: '2026-11-18T02:00:00Z' });
const pod = (stopId: string): Command => ({
  kind: 'POD',
  stopId,
  recipientName: 'A',
  deliveredAt: '2026-11-18T01:30:00Z',
  notes: null,
  photo: null,
  clientDocumentId: 'd',
});

describe('applyCommand', () => {
  it('starts a trip', () => {
    const next = applyCommand(trip(), { kind: 'START', occurredAt: 'x' });
    expect(next.status).toBe('IN_TRANSIT');
    expect(next.startedAt).toBe('x');
  });

  it('checks in, captures proof and checks out a stop', () => {
    let t = trip({ status: 'IN_TRANSIT' });
    t = applyCommand(t, checkIn('s1'));
    expect(t.stops[0].status).toBe('ARRIVED');
    t = applyCommand(t, pod('s1'));
    expect(t.stops[0]).toMatchObject({ status: 'DELIVERED', podStatus: 'CAPTURED' });
    t = applyCommand(t, checkOut('s1'));
    expect(t.stops[0].status).toBe('DELIVERED');
    expect(t.stops[0].actualDepartureAt).not.toBeNull();
  });

  it('marks a stop DEPARTED when it is left without proof', () => {
    const t = applyCommand(trip({ status: 'IN_TRANSIT', stops: [stop(1, { status: 'ARRIVED' })] }), checkOut('s1'));
    expect(t.stops[0].status).toBe('DEPARTED');
  });

  it('completes a trip and ignores commands that do not change it', () => {
    expect(applyCommand(trip({ status: 'IN_TRANSIT' }), { kind: 'COMPLETE', occurredAt: 'x' }).status).toBe('DELIVERED');
    const t = trip();
    expect(applyCommand(t, { kind: 'NOTE', text: 'x' })).toBe(t);
  });

  it('does not mutate the trip it is given', () => {
    const t = trip({ status: 'IN_TRANSIT' });
    applyCommand(t, checkIn('s1'));
    expect(t.stops[0].status).toBe('PLANNED');
  });
});

describe('projectTrip', () => {
  it('lets the driver keep working offline: the next stop opens after a queued check-out', () => {
    const rows = [
      { command: { kind: 'START', occurredAt: 'x' } as Command, status: 'pending' as const },
      { command: checkIn('s1'), status: 'pending' as const },
      { command: pod('s1'), status: 'pending' as const },
      { command: checkOut('s1'), status: 'pending' as const },
    ];
    const shown = projectTrip(trip(), rows);
    expect(shown.status).toBe('IN_TRANSIT');
    const second = shown.stops[1];
    expect(stopActions(shown, second)).toEqual(['CHECK_IN']);
  });

  it('skips done rows (the server copy already has them) and stops at a failed one', () => {
    const rows = [
      { command: { kind: 'START', occurredAt: 'x' } as Command, status: 'done' as const },
      { command: checkIn('s1'), status: 'failed' as const },
      { command: checkOut('s1'), status: 'pending' as const },
    ];
    const shown = projectTrip(trip({ status: 'IN_TRANSIT' }), rows);
    expect(shown.stops[0].status).toBe('PLANNED');
  });
});

describe('effectApplied and kinds', () => {
  it('recognises what the server already shows', () => {
    const t = trip({
      status: 'IN_TRANSIT',
      stops: [stop(1, { status: 'DELIVERED', podStatus: 'CAPTURED', actualArrivalAt: 'a', actualDepartureAt: 'b' }), stop(2)],
    });
    expect(effectApplied(t, { kind: 'START', occurredAt: 'x' })).toBe(true);
    expect(effectApplied(t, checkIn('s1'))).toBe(true);
    expect(effectApplied(t, checkOut('s1'))).toBe(true);
    expect(effectApplied(t, pod('s1'))).toBe(true);
    expect(effectApplied(t, checkIn('s2'))).toBe(false);
    expect(effectApplied(t, { kind: 'COMPLETE', occurredAt: 'x' })).toBe(false);
  });

  it('separates trip commands from side requests', () => {
    expect(isTripCommand('CHECK_IN')).toBe(true);
    expect(isTripCommand('NOTE')).toBe(false);
    expect(isTripCommand('POD_PHOTO')).toBe(false);
  });
});

describe('local arrival rule', () => {
  const here = { latitude: 13.7563, longitude: 100.5018 };

  it('measures distance like the backend', () => {
    expect(distanceMeters(13.7563, 100.5018, 13.7563, 100.5018)).toBe(0);
    // 0.001 degree of latitude is about 111 m.
    expect(Math.round(distanceMeters(13.7563, 100.5018, 13.7573, 100.5018))).toBeCloseTo(111, -1);
  });

  it('allows check-in inside the geofence with a fresh fix', () => {
    const now = 1_000_000;
    const result = localArrival({ ...here, at: now - 1000 }, stop(1), now);
    expect(result).toMatchObject({ gpsFresh: true, canCheckIn: true });
  });

  it('refuses outside the geofence, with a stale fix, or with none', () => {
    const now = 10_000_000;
    const far = { latitude: here.latitude + 0.01, longitude: here.longitude, at: now };
    expect(localArrival(far, stop(1), now).canCheckIn).toBe(false);
    expect(localArrival({ ...here, at: now - 6 * 60 * 1000 }, stop(1), now)).toMatchObject({ gpsFresh: false, canCheckIn: false });
    expect(localArrival(null, stop(1), now).gpsFresh).toBe(false);
    expect(ARRIVAL_GEOFENCE_METERS).toBe(200);
  });
});

describe('manual check-in after a refusal', () => {
  it('turns a refused check-in into a manual one with the reason', () => {
    const next = asManualCheckIn(checkIn('s1'), '  GPS was off  ');
    expect(next).toMatchObject({ kind: 'CHECK_IN', stopId: 's1', manualOverride: true, overrideReason: 'GPS was off' });
  });

  it('refuses an empty reason and any command that is not a check-in', () => {
    expect(asManualCheckIn(checkIn('s1'), '   ')).toBeNull();
    expect(asManualCheckIn(checkOut('s1'), 'why')).toBeNull();
  });

  it('keeps the time the driver pressed the button', () => {
    const original = checkIn('s1');
    const next = asManualCheckIn(original, 'why');
    expect(next && 'occurredAt' in next ? next.occurredAt : null).toBe('occurredAt' in original ? original.occurredAt : 'x');
  });
});
