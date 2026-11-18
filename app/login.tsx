import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text } from 'react-native';

import { login } from '../src/api/mobile';
import { useSession } from '../src/auth/session';
import { describeError } from '../src/errors';
import { t } from '../src/i18n';
import { colors, spacing } from '../src/theme';
import { Button, Card, ErrorText, Field, Screen } from '../src/ui';

export default function LoginScreen() {
  const router = useRouter();
  const { tenant, signIn } = useSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const signInMutation = useMutation({
    mutationFn: () => login(tenant!.tenantId, email, password),
    onSuccess: (result) =>
      signIn({ token: result.accessToken, expiresAt: result.expiresAt, account: result.account }),
    onError: (e) => setError(describeError(e, 'login')),
  });

  const submit = () => {
    if (!tenant || !email.trim() || !password) return setError(t('errorRequired'));
    setError(null);
    signInMutation.mutate();
  };

  return (
    <Screen edges={['top', 'bottom']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.company}>{tenant?.displayName}</Text>
          <Text style={styles.title}>{t('loginTitle')}</Text>
          <Card>
          <Field
            label={t('email')}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
          />
          <Field
            label={t('password')}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            autoComplete="password"
            returnKeyType="go"
            onSubmitEditing={submit}
          />
          <ErrorText message={error} />
          <Button title={t('signIn')} onPress={submit} busy={signInMutation.isPending} />
          </Card>
          <Button title={t('changeCompany')} variant="secondary" onPress={() => router.replace('/company')} />
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.page },
  flex: { flex: 1 },
  content: { padding: spacing.lg, gap: spacing.md, flexGrow: 1, justifyContent: 'center' },
  company: { color: colors.muted, fontSize: 16 },
  title: { color: colors.text, fontSize: 30, fontWeight: '700' },
});
