import { ResizeMode, Video } from 'expo-av';
import React, { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { useTestMode } from '../context/TestModeContext';
import { t } from '../i18n/strings';
import { RootScreenProps } from '../navigation/types';
import { useFixtures } from '../storage/useFixtures';
import { useStreamConfig } from '../storage/useStreamConfig';
import { colors, font, radius, spacing } from '../theme/theme';

/**
 * Bundled demo clip — the default source. A licensed stream configured
 * in admin settings (e.g. from a beIN SPORTS agreement) takes priority.
 */
const DEMO_VIDEO = require('../../assets/video/demo-match.mp4');

export function PlayerScreen({ route }: RootScreenProps<'Player'>) {
  const { matches } = useFixtures();
  const { enabled: testMode } = useTestMode();
  const { config: streamConfig } = useStreamConfig();
  const [videoReady, setVideoReady] = useState(false);
  const [videoError, setVideoError] = useState(false);

  const match = matches.find((m) => m.id === route.params.matchId);

  const licensedUrl = streamConfig?.url;
  const source = licensedUrl
    ? {
        uri: licensedUrl,
        headers: streamConfig?.token
          ? { Authorization: `Bearer ${streamConfig.token}` }
          : undefined,
      }
    : DEMO_VIDEO;

  // Defensive guard: play nothing unless the local *6 test mode is on
  // or a licensed stream has been configured in admin settings.
  if (!testMode && !licensedUrl) {
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
        <Text style={styles.bannerText}>
          {licensedUrl && streamConfig
            ? t.licensedBanner(streamConfig.provider)
            : t.demoBanner}
        </Text>
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
            source={source}
            useNativeControls
            resizeMode={ResizeMode.CONTAIN}
            shouldPlay
            isLooping
            onReadyForDisplay={() => setVideoReady(true)}
            onError={() => setVideoError(true)}
          />
        )}
      </View>

      {!licensedUrl && <Text style={styles.legal}>{t.legalFooter}</Text>}
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
