import AsyncStorage from '@react-native-async-storage/async-storage';

const STREAM_CONFIG_KEY = '@kooratest/stream_config_v1';

/**
 * Configuration for a licensed stream provider (e.g. beIN SPORTS).
 * Filled in from the admin settings screen once the user has a
 * broadcast agreement; the app ships with none configured.
 */
export interface StreamConfig {
  /** Display name of the rights holder, e.g. "beIN SPORTS" */
  provider: string;
  /** Stream URL given by the provider (HLS .m3u8 or MP4) */
  url: string;
  /** Optional access token/key supplied by the provider */
  token?: string;
  /** Free-form notes (account id, contact, contract ref, ...) */
  notes?: string;
  updatedAt: string;
}

export async function loadStreamConfig(): Promise<StreamConfig | null> {
  try {
    const raw = await AsyncStorage.getItem(STREAM_CONFIG_KEY);
    return raw ? (JSON.parse(raw) as StreamConfig) : null;
  } catch {
    return null;
  }
}

export async function saveStreamConfig(
  config: Omit<StreamConfig, 'updatedAt'>,
): Promise<StreamConfig> {
  const full: StreamConfig = { ...config, updatedAt: new Date().toISOString() };
  await AsyncStorage.setItem(STREAM_CONFIG_KEY, JSON.stringify(full));
  return full;
}

export async function clearStreamConfig(): Promise<void> {
  await AsyncStorage.removeItem(STREAM_CONFIG_KEY);
}
