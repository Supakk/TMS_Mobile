import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

import { useSession } from '../../../src/auth/session';
import { MOCK } from '../../../src/config';
import { isMockOffline, setMockOffline } from '../../../src/mock/server';
import { useOutboxSummary } from '../../../src/hooks/useTrips';
import { t } from '../../../src/i18n';
import { useSettings, type EraSetting } from '../../../src/settings/settings';
import { colors, spacing } from '../../../src/theme';
import { Button, Card, Choice, Row, Screen } from '../../../src/ui';
import type { LanguageSetting } from '../../../src/i18n';

export default function SettingsScreen() {
  const { session, tenant, signOut } = useSession();
  const { languageSetting, eraSetting, setLanguageSetting, setEraSetting } = useSettings();
  const router = useRouter();
  const { waiting, failed, samples } = useOutboxSummary();
  const unsent = waiting + failed;
  const [noSignal, setNoSignal] = useState(isMockOffline());

  // Signing out keeps the unsent work on the phone, but the driver should know it has not reached the office.
  const confirmSignOut = () => {
    if (unsent === 0 && samples === 0) return void signOut();
    Alert.alert(t('signOutPendingTitle'), t('signOutPendingBody', { n: unsent + samples }), [
      { text: t('cancel'), style: 'cancel' },
      { text: t('signOutAnyway'), style: 'destructive', onPress: () => void signOut() },
    ]);
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>{t('settingsTitle')}</Text>

        <Card>
          <Choice<LanguageSetting>
            label={t('language')}
            value={languageSetting}
            onChange={setLanguageSetting}
            options={[
              { value: 'auto', label: t('languageAuto') },
              { value: 'en', label: t('languageEn') },
              { value: 'th', label: t('languageTh') },
            ]}
          />
          <Choice<EraSetting>
            label={t('yearEra')}
            value={eraSetting}
            onChange={setEraSetting}
            options={[
              { value: 'auto', label: t('eraAuto') },
              { value: 'BE', label: t('eraBE') },
              { value: 'CE', label: t('eraCE') },
            ]}
          />
        </Card>

        <Card>
          <Text style={styles.heading}>{t('account')}</Text>
          <Row label={t('company')} value={tenant?.displayName ?? t('none')} />
          <Row label={t('email')} value={session?.account.email ?? t('none')} />
        </Card>

        <Card onPress={() => router.push('/outbox')}>
          <Row label={t('unsentWork')} value={String(unsent + samples)} />
        </Card>

        {MOCK ? (
          <Card>
            <View style={styles.switchRow}>
              <Text style={styles.switchLabel}>{t('mockOffline')}</Text>
              <Switch
                value={noSignal}
                onValueChange={(value) => {
                  setMockOffline(value);
                  setNoSignal(value);
                }}
                trackColor={{ true: colors.accent }}
              />
            </View>
          </Card>
        ) : null}

        <Button title={t('signOut')} variant="secondary" onPress={confirmSignOut} />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.page },
  content: { padding: spacing.lg, gap: spacing.md },
  title: { color: colors.text, fontSize: 30, fontWeight: '700' },
  heading: { color: colors.text, fontSize: 18, fontWeight: '700' },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  switchLabel: { color: colors.text, fontSize: 16, flex: 1 },
});
