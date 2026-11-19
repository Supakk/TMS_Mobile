// 10.0.2.2 is the host computer as seen from the Android emulator.
// Override with EXPO_PUBLIC_API_BASE_URL (for example in a .env file) for a real phone.
export const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://10.0.2.2:5100/api';

// The live-update hub. Derived from the API address (/api -> /hubs/tracking) unless EXPO_PUBLIC_HUB_URL is set.
export const HUB_URL = process.env.EXPO_PUBLIC_HUB_URL;

// A write that times out has an unknown outcome, so it gets longer. A read that is slow is better answered from the
// copy saved on the phone, so it gives up sooner and the driver is not left on a loading screen with a weak signal.
export const REQUEST_TIMEOUT_MS = 20_000;
export const READ_TIMEOUT_MS = 8_000;

// EXPO_PUBLIC_MOCK=1 answers every request from src/mock/server.ts instead of the network, for trying the app without a backend.
export const MOCK = process.env.EXPO_PUBLIC_MOCK === '1';
