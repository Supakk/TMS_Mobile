import { focusManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';

import '../src/location/tracking'; // defines the background location task before anything renders
import { SessionProvider, useSession } from '../src/auth/session';
import { SettingsProvider, useSettings } from '../src/settings/settings';
import { colors } from '../src/theme';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 10_000 } },
});

function Routes() {
  const { ready, session } = useSession();
  const settings = useSettings();
  if (!ready || !settings.ready) return null;

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.page } }}>
      <Stack.Protected guard={!session}>
        <Stack.Screen name="company" />
        <Stack.Screen name="login" />
      </Stack.Protected>
      <Stack.Protected guard={!!session}>
        <Stack.Screen name="(app)" />
      </Stack.Protected>
    </Stack>
  );
}

/** Tells React Query when the app comes back to the foreground so the trip list refreshes. */
function useForegroundRefetch() {
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const subscription = AppState.addEventListener('change', (state) => {
      focusManager.setFocused(state === 'active');
    });
    return () => subscription.remove();
  }, []);
}

/** The language is part of the key, so a change in Settings repaints every screen with the new words. */
function Keyed() {
  const { language, era } = useSettings();
  return (
    <SessionProvider key={`${language}-${era}`}>
      <StatusBar style="dark" />
      <Routes />
    </SessionProvider>
  );
}

export default function RootLayout() {
  useForegroundRefetch();
  return (
    <QueryClientProvider client={queryClient}>
      <SettingsProvider>
        <Keyed />
      </SettingsProvider>
    </QueryClientProvider>
  );
}
