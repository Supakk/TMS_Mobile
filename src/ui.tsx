import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';

import { tCode } from './i18n';
import { colors, radius, shadow, spacing, statusTone, tones, touchTarget, type Tone } from './theme';

/** A page: the page colour with the soft pink and violet glow of the web app behind the content. */
export function Screen({ children, edges = ['top'] }: { children: ReactNode; edges?: Edge[] }) {
  return (
    <SafeAreaView style={styles.screen} edges={edges}>
      <Glow rgb={colors.glowPink} size={460} alpha={0.0155} style={{ top: -170, right: -190 }} />
      <Glow rgb={colors.glowViolet} size={520} alpha={0.009} style={{ bottom: -200, left: -230 }} />
      {children}
    </SafeAreaView>
  );
}

/** A soft radial glow made of stacked circles: no gradient package, no blur. */
function Glow({ rgb, size, alpha, style }: { rgb: string; size: number; alpha: number; style: ViewStyle }) {
  const steps = 28;
  return (
    <View pointerEvents="none" style={[{ position: 'absolute', width: size, height: size }, style]}>
      {Array.from({ length: steps }, (_, i) => {
        const d = size * (1 - i / steps);
        return (
          <View
            key={i}
            style={{
              position: 'absolute',
              width: d,
              height: d,
              borderRadius: d / 2,
              left: (size - d) / 2,
              top: (size - d) / 2,
              backgroundColor: `rgba(${rgb}, ${alpha})`,
            }}
          />
        );
      })}
    </View>
  );
}

export function Field({ label, multiline, style, ...input }: { label: string } & TextInputProps) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        placeholderTextColor={colors.muted}
        style={[styles.input, multiline && styles.inputMulti, style]}
        accessibilityLabel={label}
        multiline={multiline}
        textAlignVertical={multiline ? 'top' : 'center'}
        {...input}
      />
    </View>
  );
}

/** Every button is a full pill, as on the web. `primary` is the main action; `secondary` is outlined. */
export function Button({
  title,
  onPress,
  busy,
  disabled,
  variant = 'primary',
}: {
  title: string;
  onPress: () => void;
  busy?: boolean;
  disabled?: boolean;
  variant?: 'primary' | 'secondary';
}) {
  const primary = variant === 'primary';
  const off = busy || disabled;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!off, busy: !!busy }}
      onPress={onPress}
      disabled={off}
      style={({ pressed }) => [
        styles.button,
        primary ? styles.buttonPrimary : styles.buttonSecondary,
        pressed && styles.buttonPressed,
        disabled && !busy && styles.buttonDisabled,
      ]}
    >
      {busy ? (
        <ActivityIndicator color={primary ? colors.onAccent : colors.accent} />
      ) : (
        <Text style={[styles.buttonText, !primary && { color: colors.text }]}>{title}</Text>
      )}
    </Pressable>
  );
}

export function ErrorText({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <Text accessibilityRole="alert" style={styles.error}>
      {message}
    </Text>
  );
}

export function Card({ children, onPress, style }: { children: ReactNode; onPress?: () => void; style?: ViewStyle }) {
  if (!onPress) return <View style={[styles.card, style]}>{children}</View>;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.card, style, pressed && styles.cardPressed]}
    >
      {children}
    </Pressable>
  );
}

export function Badge({ tone, children }: { tone: Tone; children: string }) {
  const palette = tones[tone];
  return (
    <View style={[styles.badge, { backgroundColor: palette.bg }]}>
      <Text style={[styles.badgeText, { color: palette.fg }]}>{children}</Text>
    </View>
  );
}

export function StatusBadge({ status }: { status: string }) {
  return <Badge tone={statusTone[status] ?? 'neutral'}>{tCode('status', status)}</Badge>;
}

export function Banner({ message, tone = 'warn' }: { message: string; tone?: 'warn' | 'ok' | 'danger' }) {
  const palette = tone === 'ok' ? tones.success : tone === 'danger' ? tones.danger : tones.pending;
  return (
    <View style={[styles.banner, { backgroundColor: palette.bg }]} accessibilityRole="alert">
      <Text style={[styles.bannerText, { color: palette.fg }]}>{message}</Text>
    </View>
  );
}

export function SectionTitle({ children }: { children: string }) {
  return <Text style={styles.section}>{children}</Text>;
}

export function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

/** One choice shown as pills (the web's filter chips); the selected one has a tinted fill and an accent border. */
export function Choice<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label?: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <View style={styles.field}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View style={styles.chips}>
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <Pressable
              key={option.value}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              onPress={() => onChange(option.value)}
              style={[styles.chip, selected && styles.chipSelected]}
            >
              <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{option.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.page, overflow: 'hidden' },

  field: { gap: spacing.xs + 2 },
  label: { color: colors.text, fontSize: 15, fontWeight: '600', marginLeft: spacing.xs },
  input: {
    minHeight: touchTarget,
    backgroundColor: colors.field,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md + 4,
    fontSize: 17,
    color: colors.text,
  },
  inputMulti: { minHeight: 110, borderRadius: radius.card, paddingTop: spacing.md - 2, paddingBottom: spacing.md - 2 },

  button: {
    minHeight: touchTarget,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    borderWidth: 1,
  },
  buttonPrimary: { backgroundColor: colors.accent, borderColor: 'transparent' },
  buttonSecondary: { backgroundColor: colors.field, borderColor: colors.border },
  buttonPressed: { transform: [{ scale: 0.97 }], opacity: 0.92 },
  buttonDisabled: { opacity: 0.45 },
  buttonText: { color: colors.onAccent, fontSize: 17, fontWeight: '600' },
  error: { color: colors.error, fontSize: 15, marginLeft: spacing.xs },

  card: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    borderColor: colors.cardBorder,
    borderWidth: 1,
    padding: spacing.md + 2,
    gap: spacing.sm,
    ...shadow,
  },
  cardPressed: { transform: [{ scale: 0.985 }], opacity: 0.94 },

  badge: { alignSelf: 'flex-start', borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 4 },
  badgeText: { fontSize: 13, fontWeight: '700' },

  banner: { borderRadius: radius.card - 6, paddingHorizontal: spacing.md, paddingVertical: spacing.md - 4 },
  bannerText: { fontSize: 15, fontWeight: '500' },

  section: { color: colors.text, fontSize: 19, fontWeight: '700', marginTop: spacing.sm, marginLeft: spacing.xs },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md },
  rowLabel: { color: colors.muted, fontSize: 15, flexShrink: 1 },
  rowValue: { color: colors.text, fontSize: 15, fontWeight: '600', flexShrink: 1, textAlign: 'right' },

  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: spacing.md + 2,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.field,
  },
  chipSelected: { borderColor: colors.accent, backgroundColor: colors.accentSoft, borderWidth: 1.5 },
  chipText: { color: colors.muted, fontSize: 16 },
  chipTextSelected: { color: colors.text, fontWeight: '700' },
});
