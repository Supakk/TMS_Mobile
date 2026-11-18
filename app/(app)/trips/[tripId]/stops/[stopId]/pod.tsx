import * as ImagePicker from 'expo-image-picker';
import { Directory, File, Paths } from 'expo-file-system';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { Image, KeyboardAvoidingView, Platform, ScrollView, StyleSheet } from 'react-native';

import { newKey } from '../../../../../../src/device';
import { t } from '../../../../../../src/i18n';
import { offline } from '../../../../../../src/offline/manager';
import { spacing } from '../../../../../../src/theme';
import { Banner, Button, Field, Screen } from '../../../../../../src/ui';

type Photo = { uri: string; name: string; mimeType: string };

/** The camera's file lives in a cache the system may clear. Copy it where it stays until the server has it. */
async function keepPhoto(source: string, name: string): Promise<string> {
  const folder = new Directory(Paths.document, 'pending-photos');
  folder.create({ idempotent: true, intermediates: true });
  const target = new File(folder, name);
  await new File(source).copy(target);
  return target.uri;
}

export default function ProofScreen() {
  const { tripId, stopId } = useLocalSearchParams<{ tripId: string; stopId: string }>();
  const router = useRouter();
  const [recipient, setRecipient] = useState('');
  const [notes, setNotes] = useState('');
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [saving, setSaving] = useState(false);
  // One stable id for the photo, so a retry never stores it twice on the server.
  const clientDocumentId = useRef(newKey());

  const takePhoto = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) return;
    const result = await ImagePicker.launchCameraAsync({ quality: 0.6 });
    const asset = result.canceled ? null : result.assets[0];
    if (asset) setPhoto({ uri: asset.uri, name: `pod-${clientDocumentId.current}.jpg`, mimeType: asset.mimeType ?? 'image/jpeg' });
  };

  const submit = async () => {
    setSaving(true);
    try {
      const kept = photo ? { ...photo, uri: await keepPhoto(photo.uri, photo.name) } : null;
      await offline.enqueue(tripId, {
        kind: 'POD',
        stopId,
        recipientName: recipient.trim(),
        // Taken on the phone now: the proof must not look later than the check-in it follows.
        deliveredAt: new Date().toISOString(),
        notes: notes.trim() || null,
        photo: kept,
        clientDocumentId: clientDocumentId.current,
      });
      router.back();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen edges={[]}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Banner tone="ok" message={t('queuedOffline')} />
          <Field label={t('recipientName')} value={recipient} onChangeText={setRecipient} />
          <Field label={t('notes')} value={notes} onChangeText={setNotes} multiline />
          {photo ? <Image source={{ uri: photo.uri }} style={styles.photo} accessibilityLabel={t('takePhoto')} /> : null}
          <Button title={photo ? t('retakePhoto') : t('takePhoto')} variant="secondary" onPress={() => void takePhoto()} />
          <Button title={t('submitProof')} busy={saving} disabled={!recipient.trim()} onPress={() => void submit()} />
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: spacing.lg, gap: spacing.md },
  photo: { width: '100%', height: 220, borderRadius: 20 },
});
