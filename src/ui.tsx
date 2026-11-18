import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View, type TextInputProps, type ViewStyle } from 'react-native';
import type { ReactNode } from 'react';

import { tCode } from './i18n';

import { colors, spacing, statusColors, touchTarget } from './theme';

export function Field({ label, ...input }: { label: string } & TextInputProps) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        placeholderTextColor={colors.muted}
        style={styles.input}
        accessibilityLabel={label}
        {...input}
      />
    </View>
  );
}

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
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={busy || disabled}
      style={({ pressed }) => [
        styles.button,
        primary ? styles.buttonPrimary : styles.buttonSecondary,
        (pressed || busy || disabled) && styles.buttonDim,
      ]}
    >
      {busy ? (
        <ActivityIndicator color={primary ? colors.onAccent : colors.accent} />
      ) : (
        <Text style={[styles.buttonText, !primary && { color: colors.accent }]}>{title}</Text>
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
      style={({ pressed }) => [styles.card, style, pressed && styles.buttonDim]}
    >
      {children}
    </Pressable>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const palette = statusColors[status] ?? statusColors.PLANNED;
  return (
    <View style={[styles.badge, { backgroundColor: palette.bg }]}>
      <Text style={[styles.badgeText, { color: palette.fg }]}>{tCode('status', status)}</Text>
    </View>
  );
}

export function Banner({ message, tone = 'warn' }: { message: string; tone?: 'warn' | 'ok' }) {
  return (
    <View style={[styles.banner, tone === 'ok' && styles.bannerOk]} accessibilityRole="alert">
      <Text style={styles.bannerText}>{message}</Text>
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

/** A single choice shown as big pressable chips; each carries a word. */
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
  card: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderColor: colors.border,
    borderWidth: 1,
    padding: spacing.md,
    gap: spacing.sm,
  },
  badge: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: spacing.sm + 2, paddingVertical: 4 },
  badgeText: { fontSize: 14, fontWeight: '700' },
  banner: { backgroundColor: '#FFF3CD', borderRadius: 10, padding: spacing.md },
  bannerOk: { backgroundColor: '#DDF1E3' },
  bannerText: { color: colors.text, fontSize: 15 },
  section: { color: colors.text, fontSize: 18, fontWeight: '700', marginTop: spacing.sm },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md },
  rowLabel: { color: colors.muted, fontSize: 15, flexShrink: 1 },
  rowValue: { color: colors.text, fontSize: 15, fontWeight: '600', flexShrink: 1, textAlign: 'right' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipSelected: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipText: { color: colors.text, fontSize: 16 },
  chipTextSelected: { color: colors.onAccent, fontWeight: '700' },
  field: { gap: spacing.xs },
  label: { color: colors.text, fontSize: 15, fontWeight: '600' },
  input: {
    minHeight: touchTarget,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: spacing.md,
    fontSize: 17,
    color: colors.text,
  },
  button: {
    minHeight: touchTarget,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  buttonPrimary: { backgroundColor: colors.accent },
  buttonSecondary: { backgroundColor: colors.surface, borderColor: colors.accent, borderWidth: 1 },
  buttonDim: { opacity: 0.6 },
  buttonText: { color: colors.onAccent, fontSize: 17, fontWeight: '600' },
  error: { color: colors.error, fontSize: 15 },
});
