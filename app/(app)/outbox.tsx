import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';

import { formatDateTime } from '../../src/dates';
import { useAccountId } from '../../src/hooks/useTrips';
import { t, tCode } from '../../src/i18n';
import { offline, useOutboxRows } from '../../src/offline/manager';
import type { OutboxRow } from '../../src/offline/types';
import { useSettings } from '../../src/settings/settings';
import { colors, spacing } from '../../src/theme';
import { Badge, Button, Card, Screen } from '../../src/ui';

function reason(row: OutboxRow): string | null {
  if (!row.error) return null;
  if (row.error.code === 'STALE') return t('failedSTALE');
  // Backend text is English; show it only as detail under our own sentence.
  return row.error.detail ? `${t('failedRejected')} ${row.error.detail}` : t('failedRejected');
}

/** Every command that has not been accepted yet. A failed one blocks the ones after it until the driver decides. */
export default function OutboxScreen() {
  const accountId = useAccountId();
  const { era } = useSettings();
  const rows = useOutboxRows()
    .filter((r) => r.accountId === accountId && r.status !== 'done')
    .sort((a, b) => a.seq - b.seq);

  const confirmDiscard = (row: OutboxRow) =>
    Alert.alert(t('discardTitle'), t('discardBody'), [
      { text: t('cancel'), style: 'cancel' },
      { text: t('discard'), style: 'destructive', onPress: () => void offline.discard(row.id) },
    ]);

  return (
    <Screen edges={[]}>
      <ScrollView contentContainerStyle={styles.content}>
        {rows.length === 0 ? <Text style={styles.meta}>{t('outboxEmpty')}</Text> : null}
        {rows.map((row) => (
          <Card key={row.id}>
            <View style={styles.top}>
              <Text style={styles.title}>{tCode('kind', row.command.kind)}</Text>
              <Badge tone={row.status === 'failed' ? 'danger' : 'pending'}>
                {row.status === 'failed' ? t('rowFailed') : row.status === 'sending' ? t('rowSending') : t('rowPending')}
              </Badge>
            </View>
            <Text style={styles.meta}>{formatDateTime(new Date(row.createdAt).toISOString(), era)}</Text>
            {reason(row) ? <Text style={styles.error}>{reason(row)}</Text> : null}
            {row.status === 'failed' ? (
              <View style={styles.actions}>
                <Button title={t('retryNow')} onPress={() => void offline.retry(row.id)} />
                <Button title={t('discard')} variant="secondary" onPress={() => confirmDiscard(row)} />
              </View>
            ) : null}
          </Card>
        ))}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, gap: spacing.md },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm },
  title: { color: colors.text, fontSize: 17, fontWeight: '700', flexShrink: 1 },
  meta: { color: colors.muted, fontSize: 15 },
  error: { color: colors.error, fontSize: 15 },
  actions: { gap: spacing.sm, marginTop: spacing.xs },
});
