import { IDLE_PASS_MS, hasWork, rowsSignature, shouldRunPass } from '../src/offline/signature';
import type { OutboxRow } from '../src/offline/types';

const row = (patch: Partial<OutboxRow> = {}): OutboxRow => ({
  id: 'r1',
  accountId: 'a1',
  tripId: 't1',
  seq: 1,
  command: { kind: 'START', occurredAt: '2026-11-19T00:00:00.000Z' },
  idempotencyKey: 'k1',
  status: 'pending',
  attempts: 0,
  nextAttemptAt: 0,
  error: null,
  createdAt: 1,
  ...patch,
});

describe('rowsSignature', () => {
  it('is the same for the same rows, even as new objects', () => {
    expect(rowsSignature([row()])).toBe(rowsSignature([row()]));
    expect(rowsSignature([])).toBe('');
  });

  it('changes when a row changes in a way a screen shows', () => {
    const base = rowsSignature([row()]);
    expect(rowsSignature([row({ status: 'sending' })])).not.toBe(base);
    expect(rowsSignature([row({ attempts: 1 })])).not.toBe(base);
    expect(rowsSignature([row({ nextAttemptAt: 5000 })])).not.toBe(base);
    expect(rowsSignature([row({ error: { code: 'X', detail: null } })])).not.toBe(base);
    expect(rowsSignature([row({ command: { kind: 'COMPLETE', occurredAt: 'x' } })])).not.toBe(base);
    expect(rowsSignature([row(), row({ id: 'r2', seq: 2 })])).not.toBe(base);
  });
});

describe('hasWork', () => {
  it('is true for a pending or sending row of this driver', () => {
    expect(hasWork([row({ status: 'pending' })], 'a1', 0)).toBe(true);
    expect(hasWork([row({ status: 'sending' })], 'a1', 0)).toBe(true);
  });

  it('is false for finished or failed rows, or rows of another driver', () => {
    expect(hasWork([row({ status: 'done' })], 'a1', 0)).toBe(false);
    expect(hasWork([row({ status: 'failed' })], 'a1', 0)).toBe(false);
    expect(hasWork([row({ accountId: 'other' })], 'a1', 0)).toBe(false);
  });

  it('is true when GPS samples are waiting', () => {
    expect(hasWork([], 'a1', 3)).toBe(true);
  });
});

describe('shouldRunPass', () => {
  it('skips an idle tick soon after the last pass', () => {
    expect(shouldRunPass([], 'a1', 0, 1_000, 1_000 + 30_000)).toBe(false);
  });

  it('still runs once in a while, to clear old rows', () => {
    expect(shouldRunPass([], 'a1', 0, 1_000, 1_000 + IDLE_PASS_MS)).toBe(true);
  });

  it('runs at once when there is work', () => {
    expect(shouldRunPass([row()], 'a1', 0, 1_000, 1_001)).toBe(true);
  });
});
