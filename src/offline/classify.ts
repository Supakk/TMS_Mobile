import { ApiError, UnknownOutcomeError } from '../api/client';
import type { Failure } from './types';

export function classify(error: unknown): Failure {
  if (error instanceof UnknownOutcomeError) return { type: 'network' };
  if (error instanceof ApiError) {
    if (error.status === 401) return { type: 'auth' };
    if (error.status === 412 || error.status === 428) return { type: 'stale' };
    if (error.status >= 500) return { type: 'server', status: error.status };
    return { type: 'rejected', status: error.status, detail: error.problem?.detail ?? error.problem?.title ?? null };
  }
  // A bug or a failure we do not know: treat as a possible network fault, so nothing is lost.
  return { type: 'network' };
}
