import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { useOutboxSummary } from '../hooks/useTrips';
import { t } from '../i18n';
import { spacing } from '../theme';
import { Banner } from '../ui';

/**
 * Says plainly where the driver stands: no connection, how much is waiting to be sent, and what failed.
 * The driver never has to guess whether a tap was received.
 */
export function SyncNotice({ offline }: { offline: boolean }) {
  const router = useRouter();
  const { waiting, failed, samples } = useOutboxSummary();
  if (!offline && waiting === 0 && failed === 0 && samples === 0) return null;

  return (
    <View style={styles.stack}>
      {offline ? <Banner message={t('offlineSaved')} /> : null}
      {waiting > 0 ? <Banner message={t('waitingToSend', { n: waiting })} /> : null}
      {samples > 0 ? <Banner message={t('samplesWaiting', { n: samples })} /> : null}
      {failed > 0 ? (
        <Pressable accessibilityRole="button" onPress={() => router.push('/outbox')}>
          <Banner tone="danger" message={t('failedToSend', { n: failed })} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({ stack: { gap: spacing.sm } });
