import { HttpTransportType, HubConnectionBuilder, LogLevel, type HubConnection } from '@microsoft/signalr';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { AppState } from 'react-native';

import { API_BASE_URL, HUB_URL, MOCK } from '../config';
import { createCoalescer, hubUrlFrom, reconnectDelayMs } from './signals';

/**
 * Keeps a SignalR connection to /hubs/tracking while the app is in front and a driver is signed in. TripUpdated (an
 * office change to a trip, or the driver's own) and a reconnect only make the app read the list and trips again.
 * Nothing in an event is used as data. The connection is closed in the background to save the battery; coming back
 * to the front reads again anyway (see the foreground refetch in the root layout).
 */
export function useRealtime(accountId: string | undefined, token: string | undefined) {
  const client = useQueryClient();

  useEffect(() => {
    if (!accountId || !token || MOCK) return; // there is no hub in mock mode

    const refresh = createCoalescer(() => {
      void client.invalidateQueries({ queryKey: ['sync', accountId] });
      void client.invalidateQueries({ queryKey: ['trip', accountId] });
    }, 1_000);

    let connection: HubConnection | null = null;
    let stopped = false;
    let attempt = 0;
    let retry: ReturnType<typeof setTimeout> | null = null;

    const open = async () => {
      if (stopped || connection) return;
      const next = new HubConnectionBuilder()
        // WebSockets only, no negotiation round trip: the server accepts the token from the query string.
        .withUrl(hubUrlFrom(API_BASE_URL, HUB_URL), {
          accessTokenFactory: () => token,
          transport: HttpTransportType.WebSockets,
          skipNegotiation: true,
        })
        .withAutomaticReconnect({ nextRetryDelayInMilliseconds: (context) => reconnectDelayMs(context.previousRetryCount) })
        .configureLogging(LogLevel.None)
        .build();
      next.on('TripUpdated', () => refresh.signal());
      next.onreconnected(() => refresh.signal());
      connection = next;
      try {
        await next.start();
        attempt = 0;
        refresh.signal(); // events missed while we were away are never replayed: read to be sure
      } catch {
        // No signal, or the server is down. Try again, slowly; the REST reads carry on meanwhile.
        connection = null;
        if (!stopped) retry = setTimeout(() => void open(), reconnectDelayMs(attempt++));
      }
    };

    const close = async () => {
      if (retry) clearTimeout(retry);
      retry = null;
      const current = connection;
      connection = null;
      await current?.stop().catch(() => undefined);
    };

    void open();
    const app = AppState.addEventListener('change', (state) => {
      if (state === 'active') void open();
      else void close();
    });

    return () => {
      stopped = true;
      app.remove();
      refresh.cancel();
      void close();
    };
  }, [accountId, token, client]);
}
