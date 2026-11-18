import { useCallback, useEffect, useRef, useState } from 'react';

import { ApiError } from '../api/client';
import { newKey } from '../device';
import { describeError, isStale } from '../errors';

/**
 * Runs one user action (a button press) and keeps its state: busy, error text.
 *
 * The idempotency key is created once per action and reused on every retry of that same action,
 * and cleared only when the server accepted it or refused it for good. A time-out keeps the key,
 * because the first request may have gone through.
 */
export function useAction<TArgs extends unknown[], TResult>(
  run: (idempotencyKey: string, ...args: TArgs) => Promise<TResult>,
  options: { onStale?: () => void | Promise<void> } = {},
) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const key = useRef<string | null>(null);
  const onStale = useRef(options.onStale);
  useEffect(() => {
    onStale.current = options.onStale;
  });

  const execute = useCallback(
    async (...args: TArgs): Promise<TResult | undefined> => {
      setBusy(true);
      setError(null);
      key.current ??= newKey();
      try {
        const result = await run(key.current, ...args);
        key.current = null;
        return result;
      } catch (e) {
        if (e instanceof ApiError) key.current = null; // The server answered: a new press is a new action.
        if (isStale(e)) await onStale.current?.();
        setError(describeError(e, 'action'));
        return undefined;
      } finally {
        setBusy(false);
      }
    },
    [run],
  );

  return { execute, busy, error, clearError: () => setError(null) };
}
