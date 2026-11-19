import type { OutboxRow } from './types';

// Two small decisions the offline manager makes on every tick, kept pure so they can be tested. Waking the sender
// and telling every screen to redraw when nothing happened costs battery and makes lists stutter.

/** How often a full pass runs even when nothing is waiting (it also clears old finished rows). */
export const IDLE_PASS_MS = 5 * 60 * 1000;

/** A string that changes exactly when something a screen shows about the outbox changes. */
export function rowsSignature(rows: OutboxRow[]): string {
  return rows
    .map((r) =>
      [r.id, r.seq, r.status, r.attempts, r.nextAttemptAt, r.error ? JSON.stringify(r.error) : '', JSON.stringify(r.command)].join('|'),
    )
    .join('\n');
}

/** Whether this driver has anything to send: a row not yet accepted by the server, or GPS samples. */
export function hasWork(rows: OutboxRow[], accountId: string, samples: number): boolean {
  if (samples > 0) return true;
  return rows.some((r) => r.accountId === accountId && (r.status === 'pending' || r.status === 'sending'));
}

/** A pass is worth running when there is work, or when it has been a while since the last one. */
export function shouldRunPass(rows: OutboxRow[], accountId: string, samples: number, lastPassAt: number, now: number): boolean {
  return hasWork(rows, accountId, samples) || now - lastPassAt >= IDLE_PASS_MS;
}
