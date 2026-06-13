import AsyncStorage from '@react-native-async-storage/async-storage';

import { Match, MOCK_MATCHES } from '../data/mockMatches';

const FIXTURES_KEY = '@kooratest/fixtures_v1';
const LAST_SYNC_KEY = '@kooratest/last_sync_v1';

export interface FixturesResult {
  matches: Match[];
  /** ISO timestamp of when fixtures were last written to storage */
  lastSync: string | null;
  /** True when the data came from AsyncStorage rather than the bundled mock */
  fromCache: boolean;
}

/**
 * Load fixtures with offline support:
 * - If fixtures exist in AsyncStorage, return them (works fully offline).
 * - Otherwise seed storage from the bundled mock data, then return it.
 */
export async function loadFixtures(): Promise<FixturesResult> {
  try {
    const [raw, lastSync] = await Promise.all([
      AsyncStorage.getItem(FIXTURES_KEY),
      AsyncStorage.getItem(LAST_SYNC_KEY),
    ]);
    if (raw) {
      return { matches: JSON.parse(raw) as Match[], lastSync, fromCache: true };
    }
  } catch {
    // Corrupt/unreadable cache — fall through and reseed below.
  }
  return seedFixtures();
}

/**
 * Simulates a network refresh: rewrites the bundled mock fixtures into
 * storage with a fresh timestamp. In a real app this would hit an API.
 */
export async function refreshFixtures(): Promise<FixturesResult> {
  return seedFixtures();
}

async function seedFixtures(): Promise<FixturesResult> {
  const now = new Date().toISOString();
  try {
    await AsyncStorage.multiSet([
      [FIXTURES_KEY, JSON.stringify(MOCK_MATCHES)],
      [LAST_SYNC_KEY, now],
    ]);
  } catch {
    // Storage unavailable — still return in-memory data so the UI works.
  }
  return { matches: MOCK_MATCHES, lastSync: now, fromCache: false };
}
