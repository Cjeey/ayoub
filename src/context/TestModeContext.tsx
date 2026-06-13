import AsyncStorage from '@react-native-async-storage/async-storage';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';

const TEST_MODE_KEY = '@kooratest/test_mode_v1';

/** Number of taps on the "*6" button required to unlock test mode. */
export const UNLOCK_TAPS = 6;
/** Tap counter resets after this much inactivity (ms). */
const TAP_WINDOW_MS = 3000;

export type CodeResult = 'enabled' | 'disabled' | 'invalid';

interface TestModeValue {
  /** True once the persisted flag has been read from storage */
  ready: boolean;
  enabled: boolean;
  /**
   * Register one tap on the "*6" button.
   * Returns the number of taps still needed (0 means it just unlocked).
   * When already enabled, a single tap disables test mode again.
   */
  registerTap: () => number;
  /**
   * Apply a dial-style activation code. "*6" toggles test mode;
   * anything else is rejected. Local flag only — nothing remote.
   */
  applyCode: (code: string) => CodeResult;
}

const TestModeContext = createContext<TestModeValue>({
  ready: false,
  enabled: false,
  registerTap: () => UNLOCK_TAPS,
  applyCode: () => 'invalid',
});

export function TestModeProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const tapCount = useRef(0);
  const tapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(TEST_MODE_KEY)
      .then((value) => setEnabled(value === 'on'))
      .catch(() => setEnabled(false))
      .finally(() => setReady(true));
  }, []);

  const persist = useCallback((on: boolean) => {
    setEnabled(on);
    AsyncStorage.setItem(TEST_MODE_KEY, on ? 'on' : 'off').catch(() => {
      // Local-only flag; losing it just means re-tapping *6 next launch.
    });
  }, []);

  const registerTap = useCallback((): number => {
    if (enabled) {
      tapCount.current = 0;
      persist(false);
      return UNLOCK_TAPS;
    }
    if (tapTimer.current) clearTimeout(tapTimer.current);
    tapTimer.current = setTimeout(() => {
      tapCount.current = 0;
    }, TAP_WINDOW_MS);

    tapCount.current += 1;
    const remaining = UNLOCK_TAPS - tapCount.current;
    if (remaining <= 0) {
      tapCount.current = 0;
      persist(true);
      return 0;
    }
    return remaining;
  }, [enabled, persist]);

  const applyCode = useCallback(
    (code: string): CodeResult => {
      if (code.trim() !== '*6') return 'invalid';
      const next = !enabled;
      persist(next);
      return next ? 'enabled' : 'disabled';
    },
    [enabled, persist],
  );

  return (
    <TestModeContext.Provider value={{ ready, enabled, registerTap, applyCode }}>
      {children}
    </TestModeContext.Provider>
  );
}

export function useTestMode(): TestModeValue {
  return useContext(TestModeContext);
}
