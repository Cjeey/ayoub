import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useState } from 'react';

import { loadStreamConfig, StreamConfig } from './streamConfigStore';

/**
 * Reads the licensed-stream configuration, re-reading every time the
 * screen gains focus so edits in admin settings apply immediately.
 */
export function useStreamConfig() {
  const [config, setConfig] = useState<StreamConfig | null>(null);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      loadStreamConfig().then((c) => {
        if (active) {
          setConfig(c);
          setLoading(false);
        }
      });
      return () => {
        active = false;
      };
    }, []),
  );

  return { config, loading };
}
