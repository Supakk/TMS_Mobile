// 10.0.2.2 is the host computer as seen from the Android emulator.
// Override with EXPO_PUBLIC_API_BASE_URL (for example in a .env file) for a real phone.
export const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://10.0.2.2:5100/api';

// The live-update hub. Derived from the API address (/api -> /hubs/tracking) unless EXPO_PUBLIC_HUB_URL is set.
export const HUB_URL = process.env.EXPO_PUBLIC_HUB_URL;

export const REQUEST_TIMEOUT_MS = 20_000;
