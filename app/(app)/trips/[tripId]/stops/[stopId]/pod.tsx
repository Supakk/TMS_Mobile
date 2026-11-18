import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { Image, KeyboardAvoidingView, Platform, ScrollView, StyleSheet } from 'react-native';

import { captureProof, uploadProofPhoto } from '../../../../../../src/api/trips';
import { newKey } from '../../../../../../src/device';
import { useAction } from '../../../../../../src/hooks/useAction';
import { useToken, useTrip, useTripCache } from '../../../../../../src/hooks/useTrips';
import { t } from '../../../../../../src/i18n';
import { spacing } from '../../../../../../src/theme';
import { Banner, Button, ErrorText, Field } from '../../../../../../src/ui';

type Photo = { uri: string; name: string; mimeType: string };

export default function ProofScreen() {
  const { tripId, stopId } = useLocalSearchParams<{ tripId: string; stopId: string }>();
  const router = useRouter();
  const token = useToken();
  const trip = useTrip(tripId);
  const cache = useTripCache();
  const [recipient, setRecipient] = useState('');
  const [notes, setNotes] = useState('');
  const [photo, setPhoto] = useState<Photo | null>(null);
  // Set once the proof exists: only the photo is left to upload.
  const [proofId, setProofId] = useState<string | null>(null);
  // One stable id for the photo, so a retry never stores it twice.
  const clientDocumentId = useRef(newKey());

  const takePhoto = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) return;
    const result = await ImagePicker.launchCameraAsync({ quality: 0.6 });
    const asset = result.canceled ? null : result.assets[0];
    if (asset) setPhoto({ uri: asset.uri, name: `pod-${stopId}.jpg`, mimeType: asset.mimeType ?? 'image/jpeg' });
  };

  const submit = useAction(
    async (key: string) => {
      let id = proofId;
      if (!id) {
        const created = await captureProof(
          { token, version: trip.data!.version, idempotencyKey: key },
          tripId,
          stopId,
          { recipientName: recipient.trim(), deliveredAt: new Date().toISOString(), notes: notes.trim() || null },
        );
        id = created.proof.id;
        setProofId(id);
        await cache.refresh(tripId);
      }
      if (photo) await uploadProofPhoto({ token }, id, photo, clientDocumentId.current);
      router.back();
    },
    { onStale: () => cache.refresh(tripId) },
  );

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Field label={t('recipientName')} value={recipient} onChangeText={setRecipient} editable={!proofId} />
        <Field label={t('notes')} value={notes} onChangeText={setNotes} multiline editable={!proofId} />
        {photo ? <Image source={{ uri: photo.uri }} style={styles.photo} accessibilityLabel={t('takePhoto')} /> : null}
        <Button title={photo ? t('retakePhoto') : t('takePhoto')} variant="secondary" onPress={() => void takePhoto()} />
        {proofId ? <Banner message={t('photoPending')} /> : null}
        <Button
          title={proofId ? t('retryPhoto') : t('submitProof')}
          busy={submit.busy}
          disabled={!recipient.trim() || !trip.data}
          onPress={() => void submit.execute()}
        />
        <ErrorText message={submit.error} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: spacing.lg, gap: spacing.md },
  photo: { width: '100%', height: 220, borderRadius: 12 },
});
