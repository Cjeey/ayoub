import { ResizeMode, Video } from 'expo-av';
import React, { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { useTestMode } from '../context/TestModeContext';
import { t } from '../i18n/strings';
import { RootScreenProps } from '../navigation/types';
import { useFixtures } from '../storage/useFixtures';
import { colors, font, radius, spacing } from '../theme/theme';

/**
 * Local demo asset only. There is intentionally no real match stream in
 * this app; a rights holder could swap this for a licensed stream URL.
 */
const DEMO_VIDEO = require('../../assets/video/demo-match.mp4');

export function PlayerScreen({ route }: RootScreenProps<'Player'>) {
  const { matches } = useFixtures();
  const { enabled: testMode } = useTestMode();
  const [videoReady, setVideoReady] = useState(false);
  const [videoError, setVideoError] = useState(false);

  const match = matches.find((m) => m.id === route.params.matchId);

  // Defensive guard: this screen is only reachable when test mode is on,
  // but never play anything if the local flag is off.
  if (!testMode) {
    return (
      <View style={styles.centered}>
        <Text style={styles.lockedText}>{t.contentLocked}</Text>
        <Text style={styles.hint}>{t.contentLockedHint}</Text>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <View style={styles.banner}>
        <Text style={styles.bannerText}>{t.demoBanner}</Text>
      </View>

      {match && (
        <Text style={styles.matchTitle}>
          {match.home.flag} {match.home.nameAr} {match.homeScore ?? ''}
          {match.status !== 'upcoming' ? ' - ' : ` ${t.vs} `}
          {match.awayScore ?? ''} {match.away.nameAr} {match.away.flag}
        </Text>
      )}

      <View style={styles.videoWrap}>
        {!videoReady && !videoError && (
          <ActivityIndicator color={colors.accent} size="large" style={styles.loader} />
        )}
        {videoError ? (
          <Text style={styles.errorText}>{t.videoError}</Text>
        ) : (
          <Video
            style={styles.video}
            source={DEMO_VIDEO}
            useNativeControls
            resizeMode={ResizeMode.CONTAIN}
            shouldPlay
            isLooping
            onReadyForDisplay={() => setVideoReady(true)}
            onError={() => setVideoError(true)}
          />
        )}
      </View>

      <Text style={styles.legal}>{t.legalFooter}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: colors.background,
    flex: 1,
    padding: spacing.lg,
  },
  centered: {
    alignItems: 'center',
    backgroundColor: colors.background,
    flex: 1,
    justifyContent: 'center',
    padding: spacing.xl,
  },
  lockedText: {
    color: colors.text,
    fontSize: font.heading,
    fontWeight: '800',
  },
  hint: {
    color: colors.textMuted,
    fontSize: font.small,
    marginTop: spacing.sm,
    textAlign: 'center',
  },
  banner: {
    backgroundColor: 'rgba(245, 197, 24, 0.12)',
    borderColor: colors.accent,
    borderRadius: radius.md,
    borderWidth: 1,
    marginBottom: spacing.lg,
    padding: spacing.md,
  },
  bannerText: {
    color: colors.accent,
    fontSize: font.small,
    fontWeight: '700',
    textAlign: 'center',
  },
  matchTitle: {
    color: colors.text,
    fontSize: font.body,
    fontWeight: '800',
    marginBottom: spacing.lg,
    textAlign: 'center',
  },
  videoWrap: {
    aspectRatio: 16 / 9,
    backgroundColor: '#000',
    borderRadius: radius.md,
    justifyContent: 'center',
    overflow: 'hidden',
    width: '100%',
  },
  loader: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1,
  },
  video: {
    height: '100%',
    width: '100%',
  },
  errorText: {
    color: colors.textMuted,
    fontSize: font.body,
    textAlign: 'center',
  },
  legal: {
    color: colors.locked,
    fontSize: font.tiny,
    marginTop: spacing.xl,
    textAlign: 'center',
  },
});
