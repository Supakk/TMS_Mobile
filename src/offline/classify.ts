import { ApiError, UnknownOutcomeError } from '../api/client';
import type { Failure } from './types';

/** Codes that mean "the trip is not as we thought": re-read it and look, instead of failing the row. */
const LOOK_AGAIN = new Set(['VERSION_CONFLICT', 'STOP_ALREADY_ARRIVED', 'POD_ALREADY_CAPTURED']);

export function classify(error: unknown): Failure {
  if (error instanceof UnknownOutcomeError) return { type: 'network' };
  if (error instanceof ApiError) {
    const code = error.problem?.code ?? null;
    if (error.status === 401) return { type: 'auth' };
    if (error.status === 412 || error.status === 428 || (code && LOOK_AGAIN.has(code))) return { type: 'stale' };
    // Too many requests passes later, like a server fault.
    if (error.status === 429 || error.status >= 500) return { type: 'server', status: error.status };
    return {
      type: 'rejected',
      status: error.status,
      code,
      detail: error.problem?.detail ?? error.problem?.title ?? null,
    };
  }
  // A bug or a failure we do not know: treat as a possible network fault, so nothing is lost.
  return { type: 'network' };
}
