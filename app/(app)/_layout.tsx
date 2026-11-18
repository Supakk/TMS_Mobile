import { Stack } from 'expo-router';
import { useEffect } from 'react';
import { Alert } from 'react-native';

import { registerDevice } from '../../src/api/trips';
import { useSession } from '../../src/auth/session';
import { getDeviceKey, platform } from '../../src/device';
import { useOfflineBridge } from '../../src/hooks/useTrips';
import { useRealtime } from '../../src/realtime/useRealtime';
import { t } from '../../src/i18n';
import { offline } from '../../src/offline/manager';
import { colors } from '../../src/theme';

/** Signed-in area. The tabs are the main pages; trip execution screens sit on top without tabs. */
export default function AppLayout() {
  const { session } = useSession();
  const token = session?.token;
  const accountId = session?.account.id;

  useOfflineBridge(accountId);
  useRealtime(accountId, token);

  // Start the sender for this driver. Work queued earlier by the same driver resumes here; work queued by
  // another driver who used this phone is never sent, and the driver is asked what to do with it.
  useEffect(() => {
    if (!token || !accountId) return;
    let cancelled = false;
    offline.configure({ accountId, token }).then(() => {
      if (cancelled) return;
      const foreign = offline.foreignCount(accountId);
      if (foreign > 0) {
        Alert.alert(t('foreignTitle'), t('foreignBody', { n: foreign }), [
          { text: t('foreignKeep'), style: 'cancel' },
          { text: t('foreignDiscard'), style: 'destructive', onPress: () => void offline.discardForeign(accountId) },
        ]);
      }
    });
    return () => {
      cancelled = true;
      void offline.configure(null);
    };
  }, [token, accountId]);

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
        headerStyle: { backgroundColor: colors.page },
        headerShadowVisible: false,
        headerTintColor: colors.accent,
        headerTitleStyle: { color: colors.text },
        contentStyle: { backgroundColor: colors.page },
        headerBackButtonDisplayMode: 'minimal',
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="outbox" options={{ title: t('outboxTitle') }} />
      <Stack.Screen name="trips/[tripId]/index" options={{ title: t('stops') }} />
      <Stack.Screen name="trips/[tripId]/request" options={{ title: t('requestTitle') }} />
      <Stack.Screen name="trips/[tripId]/stops/[stopId]/index" options={{ title: t('stops') }} />
      <Stack.Screen name="trips/[tripId]/stops/[stopId]/pod" options={{ title: t('captureProof') }} />
    </Stack>
  );
}
