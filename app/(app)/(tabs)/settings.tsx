import { ScrollView, StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useSession } from '../../../src/auth/session';
import { t } from '../../../src/i18n';
import { useSettings, type EraSetting } from '../../../src/settings/settings';
import { colors, spacing } from '../../../src/theme';
import { Button, Card, Choice, Row } from '../../../src/ui';
import type { LanguageSetting } from '../../../src/i18n';

export default function SettingsScreen() {
  const { session, tenant, signOut } = useSession();
  const { languageSetting, eraSetting, setLanguageSetting, setEraSetting } = useSettings();

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
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

        <Button title={t('signOut')} variant="secondary" onPress={() => void signOut()} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.page },
  content: { padding: spacing.lg, gap: spacing.md },
  title: { color: colors.accent, fontSize: 28, fontWeight: '700' },
  heading: { color: colors.text, fontSize: 18, fontWeight: '700' },
});
