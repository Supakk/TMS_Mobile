// Same palette as the web app (AGENT_CONTEXT section 9). Solid surfaces, no blur.
export const colors = {
  page: '#E9EBEF',
  surface: '#FFFFFF',
  text: '#16181D',
  muted: '#5B6371',
  accent: '#A82C5E',
  onAccent: '#FFFFFF',
  border: '#C9CED6',
  error: '#B3261E',
};

export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 };

/** Big touch targets for a driver using the phone in a cab. */
export const touchTarget = 52;

/** Status colours always come with a word on screen, never colour alone. */
export const statusColors: Record<string, { bg: string; fg: string }> = {
  PLANNED: { bg: '#E3E6EC', fg: '#3C4350' },
  DISPATCHED: { bg: '#DCE8FA', fg: '#1D4E96' },
  IN_TRANSIT: { bg: '#FBE3EC', fg: '#8A1F49' },
  DELIVERED: { bg: '#DDF1E3', fg: '#1E6B35' },
  CANCELLED: { bg: '#F6DAD7', fg: '#8F1D15' },
};
