import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type PressableProps,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import Animated, {
  FadeInDown,
  FadeOut,
  LinearTransition,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';

import { tCode } from './i18n';
import { colors, radius, shadow, spacing, statusTone, tones, touchTarget, type Tone } from './theme';

// Motion. Everything below runs on the UI thread (Reanimated), so it stays smooth while the JS thread is busy, and
// it follows the phone's "reduce motion" setting. Springs for touch (it feels physical), short fades for things
// that appear.

/** A list item rising into place, a little later for each one so a list settles in rather than popping up. */
export const rise = (index = 0) => FadeInDown.delay(Math.min(index, 6) * 70).duration(320);

/** The same gentle layout change for a block that moves because a sibling came or went. */
export const settle = LinearTransition.duration(240);

/** A pressable that squeezes a little under the finger and springs back. */
type SqueezeProps = Omit<PressableProps, 'style'> & {
  style?: StyleProp<ViewStyle>;
  wrapStyle?: StyleProp<ViewStyle>;
  to?: number;
};
function Squeeze({ style, wrapStyle, to = 0.97, onPressIn, onPressOut, children, ...rest }: SqueezeProps) {
  const scale = useSharedValue(1);
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <Animated.View style={[animated, wrapStyle]}>
      <Pressable
        {...rest}
        onPressIn={(event) => {
          scale.set(withSpring(to, { damping: 18, stiffness: 420 }));
          onPressIn?.(event);
        }}
        onPressOut={(event) => {
          scale.set(withSpring(1, { damping: 14, stiffness: 320 }));
          onPressOut?.(event);
        }}
        style={style}
      >
        {children}
      </Pressable>
    </Animated.View>
  );
}

/** A grey block that breathes while something loads: calmer than a spinner and it keeps the page's shape. */
export function Skeleton({ height = 80, style }: { height?: number; style?: StyleProp<ViewStyle> }) {
  const opacity = useSharedValue(1);
  useEffect(() => {
    opacity.set(withRepeat(withSequence(withTiming(0.45, { duration: 700 }), withTiming(1, { duration: 700 })), -1));
  }, [opacity]);
  const animated = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return <Animated.View style={[styles.skeleton, { height }, style, animated]} accessibilityElementsHidden />;
}

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
    // Many stacked circles: drawn once and kept as a texture, not redrawn with every scroll or change.
    <View pointerEvents="none" renderToHardwareTextureAndroid shouldRasterizeIOS style={[{ position: 'absolute', width: size, height: size }, style]}>
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

/** The teal-to-indigo block used for the load that needs an answer. Children are drawn on top, in white. */
export function Hero({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return (
    <LinearGradient
      colors={[colors.heroFrom, colors.heroTo]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.hero, style]}
    >
      {children}
    </LinearGradient>
  );
}

/** A small white pill with a label and a chevron, like "View >". */
export function ViewPill({ label, onPress, dark }: { label: string; onPress: () => void; dark?: boolean }) {
  return (
    <Squeeze
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={8}
      to={0.93}
      style={[styles.viewPill, dark && styles.viewPillDark]}
    >
      <Text style={[styles.viewPillText, dark && { color: colors.text }]}>{label}</Text>
      <Ionicons name="chevron-forward" size={14} color={colors.text} />
    </Squeeze>
  );
}

const TRACK_PAD = 3;

/** Three or more choices in one grey track; the white tab slides to the one you pick. */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  const [width, setWidth] = useState(0);
  const segment = options.length > 0 ? Math.max(0, width - TRACK_PAD * 2) / options.length : 0;
  const index = Math.max(0, options.findIndex((option) => option.value === value));
  const x = useSharedValue(0);
  const placed = useRef(false);

  useEffect(() => {
    if (segment <= 0) return;
    if (!placed.current) {
      x.set(index * segment); // the first time, put it in place without sliding in from the edge
      placed.current = true;
    } else {
      x.set(withSpring(index * segment, { damping: 20, stiffness: 240 }));
    }
  }, [index, segment, x]);

  const slide = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));

  return (
    <View style={styles.track} accessibilityRole="tablist" onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
      {segment > 0 ? <Animated.View pointerEvents="none" style={[styles.indicator, { width: segment }, slide]} /> : null}
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            onPress={() => onChange(option.value)}
            style={styles.segment}
          >
            <Text style={[styles.segmentText, selected && styles.segmentTextSelected]} numberOfLines={1}>
              {option.label}
            </Text>
          </Pressable>
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
    <Squeeze
      accessibilityRole="button"
      accessibilityState={{ disabled: !!off, busy: !!busy }}
      onPress={onPress}
      disabled={off}
      style={[styles.button, primary ? styles.buttonPrimary : styles.buttonSecondary, disabled && !busy && styles.buttonDisabled]}
    >
      {busy ? (
        <ActivityIndicator color={primary ? colors.onAccent : colors.accent} />
      ) : (
        <Text style={[styles.buttonText, !primary && { color: colors.text }]}>{title}</Text>
      )}
    </Squeeze>
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
    <Squeeze accessibilityRole="button" onPress={onPress} to={0.985} style={[styles.card, style]}>
      {children}
    </Squeeze>
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
    <Animated.View
      entering={FadeInDown.duration(240)}
      exiting={FadeOut.duration(160)}
      layout={settle}
      style={[styles.banner, { backgroundColor: palette.bg }]}
      accessibilityRole="alert"
    >
      <Text style={[styles.bannerText, { color: palette.fg }]}>{message}</Text>
    </Animated.View>
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

  hero: { borderRadius: radius.card, padding: spacing.md + 2, gap: spacing.xs + 2 },
  viewPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    paddingHorizontal: 14,
    minHeight: 36,
  },
  viewPillDark: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  viewPillText: { color: colors.text, fontSize: 14, fontWeight: '600' },

  track: { flexDirection: 'row', backgroundColor: colors.trackBg, borderRadius: 14, padding: 3 },
  segment: { flex: 1, minHeight: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 11, paddingHorizontal: 6 },
  indicator: { position: 'absolute', top: TRACK_PAD, bottom: TRACK_PAD, left: TRACK_PAD, borderRadius: 11, backgroundColor: colors.surface, ...shadow },
  skeleton: { backgroundColor: colors.trackBg, borderRadius: radius.card - 6 },
  segmentText: { color: colors.muted, fontSize: 14, fontWeight: '500' },
  segmentTextSelected: { color: colors.text, fontWeight: '700' },

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
