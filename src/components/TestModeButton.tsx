import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useTestMode } from '../context/TestModeContext';
import { t } from '../i18n/strings';
import { colors, font, radius, spacing } from '../theme/theme';

/**
 * The "*6" test-mode button: tap it 6 times to unlock the local demo
 * content. When test mode is on, a single tap turns it off again.
 * This only flips a local flag in AsyncStorage — nothing remote.
 */
export function TestModeButton() {
  const { enabled, registerTap } = useTestMode();
  const [hint, setHint] = useState<string | null>(null);

  const onPress = () => {
    const wasEnabled = enabled;
    const remaining = registerTap();
    if (wasEnabled) {
      setHint(t.testModeDisabled);
    } else if (remaining === 0) {
      setHint(t.testModeUnlocked);
    } else {
      setHint(t.testModeTapsLeft(remaining));
    }
  };

  return (
    <View style={styles.container}>
      <Pressable
        style={({ pressed }) => [
          styles.button,
          enabled && styles.buttonOn,
          pressed && styles.pressed,
        ]}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={t.testModeButton}
      >
        <Text style={[styles.buttonText, enabled && styles.buttonTextOn]}>
          {t.testModeButton}
        </Text>
      </Pressable>
      <Text style={styles.status}>{hint ?? (enabled ? t.testModeOn : t.testModeOff)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    marginVertical: spacing.lg,
  },
  button: {
    backgroundColor: 'transparent',
    borderColor: colors.accent,
    borderRadius: radius.pill,
    borderWidth: 2,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
  },
  buttonOn: {
    backgroundColor: colors.accent,
  },
  pressed: {
    opacity: 0.7,
  },
  buttonText: {
    color: colors.accent,
    fontSize: font.body,
    fontWeight: '800',
  },
  buttonTextOn: {
    color: colors.accentDark,
  },
  status: {
    color: colors.textMuted,
    fontSize: font.small,
    marginTop: spacing.sm,
    textAlign: 'center',
  },
});
