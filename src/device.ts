import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const KEY = 'tms.deviceKey';
let cached: string | null = null;

/** A stable id for this install. The server rejects event commands from a device that is not registered. */
export async function getDeviceKey(): Promise<string> {
  if (cached) return cached;
  let value: string | null = null;
  try {
    value = await SecureStore.getItemAsync(KEY);
  } catch {
    value = null;
  }
  if (!value) {
    value = Crypto.randomUUID();
    await SecureStore.setItemAsync(KEY, value).catch(() => undefined);
  }
  cached = value;
  return value;
}

export const platform: 'ANDROID' | 'IOS' = Platform.OS === 'ios' ? 'IOS' : 'ANDROID';

export const newKey = (): string => Crypto.randomUUID();
