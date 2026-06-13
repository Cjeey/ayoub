import React, { useMemo } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { MatchCard } from '../components/MatchCard';
import { TestModeButton } from '../components/TestModeButton';
import { Match } from '../data/mockMatches';
import { t } from '../i18n/strings';
import { RootScreenProps } from '../navigation/types';
import { useFixtures } from '../storage/useFixtures';
import { colors, font, radius, spacing } from '../theme/theme';
import { countdownText, kickoffTime } from '../utils/date';

export function HomeScreen({ navigation }: RootScreenProps<'Home'>) {
  const { matches, loading } = useFixtures();

  const { hero, upcoming } = useMemo(() => {
    const sorted = [...matches].sort(
      (a, b) => new Date(a.kickoffISO).getTime() - new Date(b.kickoffISO).getTime(),
    );
    const live = sorted.find((m) => m.status === 'live');
    const future = sorted.filter((m) => m.status === 'upcoming');
    const heroMatch: Match | undefined = live ?? future[0];
    return {
      hero: heroMatch,
      upcoming: future.filter((m) => m.id !== heroMatch?.id).slice(0, 3),
    };
  }, [matches]);

  const openDetail = (match: Match) =>
    navigation.navigate('MatchDetail', { matchId: match.id });

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>⚽ {t.appName}</Text>
        <Text style={styles.tagline}>{t.appTagline}</Text>

        {loading ? (
          <ActivityIndicator color={colors.accent} style={styles.loader} />
        ) : (
          <>
            {hero && (
              <>
                <Text style={styles.sectionTitle}>{t.nextMatch}</Text>
                <MatchCard match={hero} onPress={openDetail} />
                {hero.status === 'upcoming' && (
                  <Text style={styles.countdown}>
                    ⏳ {countdownText(hero.kickoffISO)} — {kickoffTime(hero.kickoffISO)}
                  </Text>
                )}
              </>
            )}

            <Text style={styles.sectionTitle}>{t.upcomingMatches}</Text>
            {upcoming.map((match) => (
              <MatchCard key={match.id} match={match} onPress={openDetail} />
            ))}

            <Pressable
              style={({ pressed }) => [styles.allButton, pressed && styles.pressed]}
              onPress={() => navigation.navigate('MatchList')}
              accessibilityRole="button"
            >
              <Text style={styles.allButtonText}>{t.seeAllMatches} ◀</Text>
            </Pressable>
          </>
        )}

        <TestModeButton />

        <Text style={styles.footerNote}>📦 {t.offlineReady}</Text>
        <Text style={styles.legal}>{t.legalFooter}</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    backgroundColor: colors.background,
    flex: 1,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  title: {
    color: colors.text,
    fontSize: font.title,
    fontWeight: '900',
    textAlign: 'center',
  },
  tagline: {
    color: colors.textMuted,
    fontSize: font.small,
    marginBottom: spacing.xl,
    marginTop: spacing.xs,
    textAlign: 'center',
  },
  loader: {
    marginVertical: spacing.xxl,
  },
  sectionTitle: {
    color: colors.accent,
    fontSize: font.heading,
    fontWeight: '800',
    marginBottom: spacing.md,
    marginTop: spacing.lg,
    textAlign: 'right',
  },
  countdown: {
    color: colors.textMuted,
    fontSize: font.small,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  allButton: {
    alignItems: 'center',
    backgroundColor: colors.cardBorder,
    borderRadius: radius.md,
    marginTop: spacing.sm,
    padding: spacing.lg,
  },
  pressed: {
    opacity: 0.8,
  },
  allButtonText: {
    color: colors.text,
    fontSize: font.body,
    fontWeight: '700',
  },
  footerNote: {
    color: colors.textMuted,
    fontSize: font.small,
    marginTop: spacing.lg,
    textAlign: 'center',
  },
  legal: {
    color: colors.locked,
    fontSize: font.tiny,
    marginTop: spacing.md,
    textAlign: 'center',
  },
});
