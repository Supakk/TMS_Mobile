import { createCoalescer, hubUrlFrom, reconnectDelayMs } from '../src/realtime/signals';

describe('hub address', () => {
  it('derives /hubs/tracking from the API address', () => {
    expect(hubUrlFrom('http://10.0.2.2:5100/api')).toBe('http://10.0.2.2:5100/hubs/tracking');
    expect(hubUrlFrom('https://tms.example.com/api/')).toBe('https://tms.example.com/hubs/tracking');
  });

  it('keeps a path prefix that is not /api', () => {
    expect(hubUrlFrom('https://host/tms/api')).toBe('https://host/tms/hubs/tracking');
  });

  it('uses the override when given', () => {
    expect(hubUrlFrom('http://x/api', 'https://hub.example.com/h')).toBe('https://hub.example.com/h');
  });
});

describe('coalescing signals', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('acts once after a burst of signals', () => {
    const act = jest.fn();
    const c = createCoalescer(act, 1000);
    c.signal();
    jest.advanceTimersByTime(400);
    c.signal();
    jest.advanceTimersByTime(400);
    c.signal();
    expect(act).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1000);
    expect(act).toHaveBeenCalledTimes(1);
  });

  it('acts again for a later signal', () => {
    const act = jest.fn();
    const c = createCoalescer(act, 1000);
    c.signal();
    jest.advanceTimersByTime(1000);
    c.signal();
    jest.advanceTimersByTime(1000);
    expect(act).toHaveBeenCalledTimes(2);
  });

  it('does nothing when cancelled', () => {
    const act = jest.fn();
    const c = createCoalescer(act, 1000);
    c.signal();
    c.cancel();
    jest.advanceTimersByTime(5000);
    expect(act).not.toHaveBeenCalled();
  });
});

describe('reconnect wait', () => {
  it('doubles from one second up to thirty', () => {
    expect([0, 1, 2, 3, 4, 5, 6, 20].map(reconnectDelayMs)).toEqual([1000, 2000, 4000, 8000, 16000, 30000, 30000, 30000]);
  });
});
