import { ApiError, UnknownOutcomeError } from './api/client';
import { t } from './i18n';

/** Backend text is English: map the common cases to the driver's language; show raw text only when nothing fits. */
export function describeError(error: unknown, context: 'company' | 'login' | 'action'): string {
  if (error instanceof UnknownOutcomeError) return t('errorNetwork');
  if (error instanceof ApiError) {
    if (error.status === 429) return t('errorTooMany');
    if (context === 'company' && (error.status === 404 || error.status === 400)) return t('errorCompanyNotFound');
    if (context === 'login' && [400, 401, 403, 422].includes(error.status)) return t('errorBadLogin');
    if (context === 'action') {
      if (error.status === 412 || error.status === 409) return t('errorStale');
      if (error.status === 403) return t('errorForbidden');
      if (error.status === 422) return error.problem?.detail ?? t('errorRule');
      if (error.status === 400 && error.problem?.detail) return error.problem.detail;
    }
  }
  return t('errorUnknown');
}

/** True when the server rejected the action because our copy of the trip is out of date. */
export function isStale(error: unknown): boolean {
  return error instanceof ApiError && (error.status === 412 || error.status === 428);
}
