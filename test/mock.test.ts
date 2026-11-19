import { handleMock, resetMock, type MockCall } from '../src/mock/server';

const call = (method: string, path: string, extra: Partial<MockCall> = {}): MockCall => ({
  method,
  path,
  body: undefined,
  token: 'mock-token',
  ifMatch: null,
  idempotencyKey: null,
  ...extra,
});

const trip = (id: string) => handleMock(call('GET', `/mobile/me/trips/${id}`)).body as { version: string; status: string; stops: { id: string; status: string }[] };

beforeEach(() => resetMock());

describe('mock backend', () => {
  it('signs in only with the demo company and password', () => {
    expect(handleMock(call('GET', '/mobile/tenants/resolve/demo', { token: null })).status).toBe(200);
    expect(handleMock(call('GET', '/mobile/tenants/resolve/nope', { token: null })).status).toBe(404);
    expect(handleMock(call('POST', '/mobile/auth/login', { token: null, body: { password: 'x' } })).status).toBe(401);
    expect(handleMock(call('POST', '/mobile/auth/login', { token: null, body: { password: 'demo1234' } })).status).toBe(200);
  });

  it('refuses a request without a token', () => {
    expect(handleMock(call('GET', '/mobile/me/sync', { token: null })).status).toBe(401);
  });

  it('refuses a change made on an old version', () => {
    const reply = handleMock(call('POST', '/mobile/me/trips/trip-a/start', { ifMatch: 'old', body: {} }));
    expect(reply.status).toBe(412);
    expect((reply.body as { code: string }).code).toBe('VERSION_CONFLICT');
  });

  it('runs a trip from start to completion in order', () => {
    const t = (id: string) => trip(id);
    handleMock(call('POST', '/mobile/me/trips/trip-a/acknowledge', { body: { accepted: true } }));
    expect(handleMock(call('POST', '/mobile/me/trips/trip-a/start', { ifMatch: t('trip-a').version, idempotencyKey: 'k1', body: {} })).status).toBe(200);

    // The second stop stays shut until the first has left.
    const early = handleMock(call('POST', '/mobile/me/trips/trip-a/stops/a2/check-in', { ifMatch: t('trip-a').version, body: {} }));
    expect((early.body as { code: string }).code).toBe('PREVIOUS_STOP_INCOMPLETE');

    for (const stop of ['a1', 'a2', 'a3']) {
      const base = `/mobile/me/trips/trip-a/stops/${stop}`;
      expect(handleMock(call('POST', `${base}/check-in`, { ifMatch: t('trip-a').version, body: {} })).status).toBe(200);
      expect(handleMock(call('POST', `${base}/proof-of-delivery`, { ifMatch: t('trip-a').version, idempotencyKey: `p-${stop}`, body: { recipientName: 'Khun A' } })).status).toBe(200 + 1);
      expect(handleMock(call('POST', `${base}/check-out`, { ifMatch: t('trip-a').version, body: {} })).status).toBe(200);
    }
    expect(handleMock(call('POST', '/mobile/me/trips/trip-a/complete', { ifMatch: t('trip-a').version, idempotencyKey: 'k2', body: {} })).status).toBe(200);
    expect(t('trip-a').status).toBe('DELIVERED');
  });

  it('will not complete while a stop has no proof', () => {
    const reply = handleMock(call('POST', '/mobile/me/trips/trip-b/complete', { ifMatch: trip('trip-b').version, idempotencyKey: 'k', body: {} }));
    expect((reply.body as { code: string }).code).toBe('POD_REQUIRED');
  });

  it('gives the first answer again for a repeated key', () => {
    const first = handleMock(call('POST', '/mobile/me/trips/trip-b/stops/b2/proof-of-delivery', { ifMatch: trip('trip-b').version, idempotencyKey: 'same', body: { recipientName: 'A' } }));
    const again = handleMock(call('POST', '/mobile/me/trips/trip-b/stops/b2/proof-of-delivery', { ifMatch: 'stale', idempotencyKey: 'same', body: { recipientName: 'A' } }));
    expect(again).toEqual(first);
  });
});
