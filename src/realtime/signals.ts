// SignalR is only a nudge. The backend keeps its events in memory and drops them when it restarts or the queue is
// full, and events missed while the phone is offline are never replayed. So an event never carries data the app
// trusts: it just makes the app read /me/sync again, and /me/sync stays the source of truth.

/** /api -> /hubs/tracking on the same host. EXPO_PUBLIC_HUB_URL overrides it. */
export function hubUrlFrom(apiBaseUrl: string, override?: string): string {
  if (override) return override;
  return `${apiBaseUrl.replace(/\/+$/, '').replace(/\/api$/, '')}/hubs/tracking`;
}

/** Waits for the signals to stop before acting once, so a burst of events costs one read. */
export function createCoalescer(act: () => void, waitMs: number) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return {
    signal() {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        act();
      }, waitMs);
    },
    cancel() {
      if (timer) clearTimeout(timer);
      timer = null;
    },
  };
}

/** Wait before reconnect attempt `n` (0 based): 1 s doubling to 30 s. The app keeps trying for as long as it is open. */
export function reconnectDelayMs(attempt: number): number {
  return Math.min(30_000, 1_000 * 2 ** Math.max(0, attempt));
}
