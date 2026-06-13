import { useCallback, useEffect, useState } from 'react';

import { Match } from '../data/mockMatches';
import { FixturesResult, loadFixtures, refreshFixtures } from './fixturesStore';

export interface UseFixtures {
  matches: Match[];
  lastSync: string | null;
  fromCache: boolean;
  loading: boolean;
  refreshing: boolean;
  refresh: () => Promise<void>;
}

/** Loads fixtures from the offline store on mount and supports pull-to-refresh. */
export function useFixtures(): UseFixtures {
  const [result, setResult] = useState<FixturesResult | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadFixtures().then((r) => {
      if (!cancelled) setResult(r);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      setResult(await refreshFixtures());
    } finally {
      setRefreshing(false);
    }
  }, []);

  return {
    matches: result?.matches ?? [],
    lastSync: result?.lastSync ?? null,
    fromCache: result?.fromCache ?? false,
    loading: result === null,
    refreshing,
    refresh,
  };
}
