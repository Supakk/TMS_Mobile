// Same design language as the web app (theme.css): pill buttons and fields, soft translucent cards
// over a page with a pink and violet glow, tinted status badges. No blur: it is heavy on mid-range
// phones and hurts legibility, so cards are near-opaque instead. Contrast pairs match the web (4.5:1).
export const colors = {
  page: '#E9EBEF',
  surface: '#FFFFFF',
  text: '#16181D',
  muted: '#5B6371',
  accent: '#A82C5E',
  accentStrong: '#8F2450',
  accentSoft: 'rgba(168, 44, 94, 0.10)',
  onAccent: '#FFFFFF',
  border: 'rgba(22, 24, 29, 0.14)',
  hairline: 'rgba(22, 24, 29, 0.08)',
  card: '#FCFCFD',
  cardBorder: '#FFFFFF',
  field: 'rgba(255, 255, 255, 0.92)',
  error: '#991B1B',
  glowPink: '236, 72, 153',
  glowViolet: '168, 85, 247',
};

export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 };

export const radius = { card: 20, field: 26, pill: 999 };

/** Big touch targets for a driver using the phone in a cab. */
export const touchTarget = 52;

export const shadow = {
  shadowColor: '#1F2687',
  shadowOpacity: 0.12,
  shadowRadius: 14,
  shadowOffset: { width: 0, height: 6 },
  elevation: 2,
};

/** Tones of the web's StatusBadge: a tinted fill with the deep shade of the colour as text. */
export const tones = {
  success: { bg: 'rgba(6, 95, 70, 0.12)', fg: '#065F46' },
  danger: { bg: 'rgba(153, 27, 27, 0.12)', fg: '#991B1B' },
  pending: { bg: 'rgba(120, 53, 15, 0.12)', fg: '#78350F' },
  info: { bg: 'rgba(7, 89, 133, 0.12)', fg: '#075985' },
  neutral: { bg: 'rgba(22, 24, 29, 0.08)', fg: '#5B6371' },
} as const;

export type Tone = keyof typeof tones;

/** Trip status to tone. Always shown with a word, never colour alone. */
export const statusTone: Record<string, Tone> = {
  PLANNED: 'neutral',
  DISPATCHED: 'info',
  IN_TRANSIT: 'pending',
  DELIVERED: 'success',
  CANCELLED: 'danger',
};
