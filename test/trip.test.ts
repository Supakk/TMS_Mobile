import { canAcknowledge, currentStop, isStopOpen, stopActions, stopWord, tripStep, type Stop, type Trip } from '../src/domain/trip';

const stop = (sequence: number, patch: Partial<Stop> = {}): Stop => ({
  id: `s${sequence}`,
  sequence,
  reference: `R${sequence}`,
  name: `Stop ${sequence}`,
  address: '',
  latitude: 13.7,
  longitude: 100.5,
  serviceMinutes: 15,
  status: 'PLANNED',
  plannedArrivalAt: null,
  actualArrivalAt: null,
  actualDepartureAt: null,
  podStatus: 'PENDING',
  stopType: 'DELIVERY',
  loadIds: null,
  ...patch,
});

const trip = (status: Trip['status'], stops: Stop[]): Pick<Trip, 'status' | 'stops'> => ({ status, stops });
const left = { actualDepartureAt: '2026-11-18T01:00:00Z' };

describe('stop order', () => {
  it('opens the first stop only until it has left', () => {
    const t = trip('IN_TRANSIT', [stop(1), stop(2)]);
    expect(isStopOpen(t, 's1')).toBe(true);
    expect(isStopOpen(t, 's2')).toBe(false);
    expect(currentStop(t)?.id).toBe('s1');
  });

  it('opens the next stop once the earlier one has left', () => {
    const t = trip('IN_TRANSIT', [stop(1, { status: 'DEPARTED', ...left }), stop(2)]);
    expect(isStopOpen(t, 's2')).toBe(true);
    expect(currentStop(t)?.id).toBe('s2');
  });

  it('sorts by sequence, not by array order', () => {
    const t = trip('IN_TRANSIT', [stop(2), stop(1)]);
    expect(currentStop(t)?.id).toBe('s1');
  });

  it('has no current stop when all have left', () => {
    expect(currentStop(trip('IN_TRANSIT', [stop(1, { status: 'DEPARTED', ...left })]))).toBeNull();
  });
});

describe('stop actions', () => {
  it('offers check-in only on the open planned stop', () => {
    const t = trip('IN_TRANSIT', [stop(1), stop(2)]);
    expect(stopActions(t, t.stops[0])).toEqual(['CHECK_IN']);
    expect(stopActions(t, t.stops[1])).toEqual([]);
  });

  it('offers proof then check-out at an arrived stop without proof', () => {
    const t = trip('IN_TRANSIT', [stop(1, { status: 'ARRIVED' })]);
    expect(stopActions(t, t.stops[0])).toEqual(['PROOF', 'CHECK_OUT']);
  });

  it('offers only check-out once proof is captured', () => {
    const arrived = trip('IN_TRANSIT', [stop(1, { status: 'ARRIVED', podStatus: 'CAPTURED' })]);
    const delivered = trip('IN_TRANSIT', [stop(1, { status: 'DELIVERED', podStatus: 'CAPTURED' })]);
    expect(stopActions(arrived, arrived.stops[0])).toEqual(['CHECK_OUT']);
    expect(stopActions(delivered, delivered.stops[0])).toEqual(['CHECK_OUT']);
  });

  it('offers nothing outside IN_TRANSIT or after leaving', () => {
    const dispatched = trip('DISPATCHED', [stop(1)]);
    const departed = trip('IN_TRANSIT', [stop(1, { status: 'DELIVERED', ...left })]);
    expect(stopActions(dispatched, dispatched.stops[0])).toEqual([]);
    expect(stopActions(departed, departed.stops[0])).toEqual([]);
  });
});

describe('trip steps', () => {
  it('starts a dispatched trip', () => {
    expect(tripStep(trip('DISPATCHED', [stop(1)]))).toEqual({ action: 'START', blockedProofCount: 0 });
  });

  it('blocks completion until every stop has proof', () => {
    const t = trip('IN_TRANSIT', [stop(1, { podStatus: 'CAPTURED' }), stop(2)]);
    expect(tripStep(t)).toEqual({ action: 'COMPLETE', blockedProofCount: 1 });
  });

  it('allows completion when all proofs are captured', () => {
    const t = trip('IN_TRANSIT', [stop(1, { podStatus: 'CAPTURED' })]);
    expect(tripStep(t)?.blockedProofCount).toBe(0);
  });

  it('has no step for finished or planned trips', () => {
    expect(tripStep(trip('DELIVERED', []))).toBeNull();
    expect(tripStep(trip('PLANNED', []))).toBeNull();
  });
});

describe('words and acknowledgement', () => {
  it('maps a stop to its word', () => {
    expect(stopWord(stop(1, { status: 'DELIVERED', ...left }))).toBe('deliveredLeft');
    expect(stopWord(stop(1, { status: 'DELIVERED' }))).toBe('delivered');
    expect(stopWord(stop(1, { status: 'ARRIVED' }))).toBe('atStop');
    expect(stopWord(stop(1, { status: 'DEPARTED' }))).toBe('leftNoProof');
    expect(stopWord(stop(1))).toBe('waiting');
  });

  it('lets a driver acknowledge only a waiting, unacknowledged trip', () => {
    expect(canAcknowledge({ status: 'DISPATCHED' }, false)).toBe(true);
    expect(canAcknowledge({ status: 'DISPATCHED' }, true)).toBe(false);
    expect(canAcknowledge({ status: 'IN_TRANSIT' }, false)).toBe(false);
  });
});
