import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text } from 'react-native';

import { SyncNotice } from '../../../../src/components/SyncNotice';
import { useTrip } from '../../../../src/hooks/useTrips';
import { t, type MessageKey } from '../../../../src/i18n';
import { offline } from '../../../../src/offline/manager';
import { colors, spacing } from '../../../../src/theme';
import { Banner, Button, Card, Choice, Field, Screen } from '../../../../src/ui';

type Mode = 'problem' | 'note' | 'load';

const PROBLEMS = ['BREAKDOWN', 'ACCIDENT', 'DELAY', 'CUSTOMER_ABSENT', 'DAMAGE', 'OTHER'];
const SEVERITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
const REASONS = ['OVER_CAPACITY', 'DAMAGED', 'VEHICLE_ISSUE', 'OTHER'];
const label = (prefix: string, code: string) => t(`${prefix}${code}` as MessageKey);

/** The driver asks; the office decides. Each request is saved on the phone and sent when there is a connection. */
export default function RequestScreen() {
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  const trip = useTrip(tripId);
  const [mode, setMode] = useState<Mode>('problem');
  const [type, setType] = useState('BREAKDOWN');
  const [severity, setSeverity] = useState('MEDIUM');
  const [text, setText] = useState('');
  const [loadId, setLoadId] = useState('');
  const [reasonCode, setReasonCode] = useState('OVER_CAPACITY');
  const [sent, setSent] = useState(false);

  const loads = trip.data?.loadIds ?? [];

  const submit = async () => {
    if (mode === 'problem') await offline.enqueue(tripId, { kind: 'PROBLEM', type, severity, description: text.trim() });
    else if (mode === 'note') await offline.enqueue(tripId, { kind: 'NOTE', text: text.trim() });
    else await offline.enqueue(tripId, { kind: 'LOAD_REQUEST', loadId, reasonCode, reasonText: text.trim() || null });
    setText('');
    setSent(true);
  };

  const ready = mode === 'load' ? !!loadId : !!text.trim();

  return (
    <Screen edges={[]}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <SyncNotice offline={trip.fromCache} />
          <Choice<Mode>
            value={mode}
            onChange={(next) => {
              setMode(next);
              setSent(false);
            }}
            options={[
              { value: 'problem', label: t('modeProblem') },
              { value: 'note', label: t('modeNote') },
              { value: 'load', label: t('modeLoad') },
            ]}
          />

          {mode === 'problem' ? (
            <>
              <Choice
                label={t('problemType')}
                value={type}
                onChange={setType}
                options={PROBLEMS.map((code) => ({ value: code, label: label('problem', code) }))}
              />
              <Choice
                label={t('severity')}
                value={severity}
                onChange={setSeverity}
                options={SEVERITIES.map((code) => ({ value: code, label: label('severity', code) }))}
              />
            </>
          ) : null}

          {mode === 'load' ? (
            <Card>
              <Banner message={t('loadRequestNote')} />
              {loads.length === 0 ? (
                <Text style={styles.meta}>{t('noLoads')}</Text>
              ) : (
                <Choice
                  label={t('chooseLoad')}
                  value={loadId}
                  onChange={setLoadId}
                  options={loads.map((id, index) => ({ value: id, label: `#${index + 1} ${id.slice(0, 8)}` }))}
                />
              )}
              <Choice
                label={t('reasonCode')}
                value={reasonCode}
                onChange={setReasonCode}
                options={REASONS.map((code) => ({ value: code, label: label('reason', code) }))}
              />
            </Card>
          ) : null}

          <Field
            label={mode === 'note' ? t('noteText') : t('description')}
            value={text}
            onChangeText={(value) => {
              setText(value);
              setSent(false);
            }}
            multiline
            maxLength={mode === 'problem' ? 2000 : 1000}
          />
          {sent ? <Banner tone="ok" message={t('queuedOffline')} /> : null}
          <Button title={t('send')} disabled={!ready} onPress={() => void submit()} />
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: spacing.lg, gap: spacing.md },
  meta: { color: colors.muted, fontSize: 15 },
});
