import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text } from 'react-native';

import { resolveTenant } from '../src/api/mobile';
import { useSession } from '../src/auth/session';
import { describeError } from '../src/errors';
import { t } from '../src/i18n';
import { colors, spacing } from '../src/theme';
import { Button, Card, ErrorText, Field, Screen } from '../src/ui';

export default function CompanyScreen() {
  const router = useRouter();
  const { saveTenant } = useSession();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);

  const resolve = useMutation({
    mutationFn: () => resolveTenant(code),
    onSuccess: async (tenant) => {
      await saveTenant(tenant);
      router.push('/login');
    },
    onError: (e) => setError(describeError(e, 'company')),
  });

  const submit = () => {
    if (!code.trim()) return setError(t('errorRequired'));
    setError(null);
    resolve.mutate();
  };

  return (
    <Screen edges={['top', 'bottom']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.title}>{t('appName')}</Text>
          <Text style={styles.hint}>{t('companyHint')}</Text>
          <Card>
          <Field
            label={t('companyCode')}
            value={code}
            onChangeText={setCode}
            autoCapitalize="characters"
            autoCorrect={false}
            returnKeyType="go"
            onSubmitEditing={submit}
          />
          <ErrorText message={error} />
          <Button title={t('continue')} onPress={submit} busy={resolve.isPending} />
          </Card>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.page },
  flex: { flex: 1 },
  content: { padding: spacing.lg, gap: spacing.md, flexGrow: 1, justifyContent: 'center' },
  title: { color: colors.text, fontSize: 30, fontWeight: '700' },
  hint: { color: colors.muted, fontSize: 16 },
});
