import { Stack } from 'expo-router';
import { useEffect } from 'react';

import { registerDevice } from '../../src/api/trips';
import { useSession } from '../../src/auth/session';
import { getDeviceKey, platform } from '../../src/device';
import { t } from '../../src/i18n';
import { colors } from '../../src/theme';

/** Signed-in area. The tabs are the main pages; trip execution screens sit on top without tabs. */
export default function AppLayout() {
  const { session } = useSession();
  const token = session?.token;

  // The server accepts event commands only from a registered device. Registering is idempotent.
  useEffect(() => {
    if (!token) return;
    getDeviceKey()
      .then((deviceKey) => registerDevice({ token }, deviceKey, platform))
      .catch(() => undefined);
  }, [token]);

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.accent,
        headerTitleStyle: { color: colors.text },
        contentStyle: { backgroundColor: colors.page },
        headerBackButtonDisplayMode: 'minimal',
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="trips/[tripId]/index" options={{ title: t('stops') }} />
      <Stack.Screen name="trips/[tripId]/request" options={{ title: t('requestTitle') }} />
      <Stack.Screen name="trips/[tripId]/stops/[stopId]/index" options={{ title: t('stops') }} />
      <Stack.Screen name="trips/[tripId]/stops/[stopId]/pod" options={{ title: t('captureProof') }} />
    </Stack>
  );
}
