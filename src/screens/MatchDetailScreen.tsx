import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { StatusChip } from '../components/StatusChip';
import { useTestMode } from '../context/TestModeContext';
import { t } from '../i18n/strings';
import { RootScreenProps } from '../navigation/types';
import { useFixtures } from '../storage/useFixtures';
import { colors, font, radius, spacing } from '../theme/theme';
import { dateLabel, kickoffTime, localDateKey } from '../utils/date';

export function MatchDetailScreen({ navigation, route }: RootScreenProps<'MatchDetail'>) {
  const { matches, loading } = useFixtures();
  const { enabled: testMode } = useTestMode();

  const match = matches.find((m) => m.id === route.params.matchId);

  if (loading) {
    return (
      <View style={styles.loaderWrap}>
        <ActivityIndicator color={colors.accent} size="large" />
      </View>
    );
  }

  if (!match) {
    return (
      <View style={styles.loaderWrap}>
        <Text style={styles.infoValue}>؟</Text>
      </View>
    );
  }

  const hasScore = match.status !== 'upcoming';

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.heroCard}>
        <StatusChip status={match.status} />
        <View style={styles.teamsRow}>
          <View style={styles.team}>
            <Text style={styles.flag}>{match.home.flag}</Text>
            <Text style={styles.teamName}>{match.home.nameAr}</Text>
          </View>
          <Text style={styles.scoreOrVs}>
            {hasScore ? `${match.homeScore ?? 0} - ${match.awayScore ?? 0}` : t.vs}
          </Text>
          <View style={styles.team}>
            <Text style={styles.flag}>{match.away.flag}</Text>
            <Text style={styles.teamName}>{match.away.nameAr}</Text>
          </View>
        </View>
      </View>

      <View style={styles.infoCard}>
        <InfoRow label={t.group} value={match.group} />
        <InfoRow label={t.stadium} value={match.stadium} />
        <InfoRow label={t.city} value={match.city} />
        <InfoRow
          label={t.kickoff}
          value={`${dateLabel(localDateKey(match.kickoffISO))} — ${kickoffTime(match.kickoffISO)}`}
        />
      </View>

      {testMode ? (
        <Pressable
          style={({ pressed }) => [styles.watchButton, pressed && styles.pressed]}
          onPress={() => navigation.navigate('Player', { matchId: match.id })}
          accessibilityRole="button"
        >
          <Text style={styles.watchButtonText}>{t.watchDemo}</Text>
        </Pressable>
      ) : (
        <View style={styles.lockedCard}>
          <Text style={styles.lockedTitle}>{t.contentLocked}</Text>
          <Text style={styles.lockedHint}>{t.contentLockedHint}</Text>
          <Pressable
            style={({ pressed }) => [styles.unlockLink, pressed && styles.pressed]}
            onPress={() => navigation.popToTop()}
            accessibilityRole="button"
          >
            <Text style={styles.unlockLinkText}>{t.goUnlock} ◀</Text>
          </Pressable>
        </View>
      )}

      <Text style={styles.legal}>{t.legalFooter}</Text>
    </ScrollView>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  loaderWrap: {
    alignItems: 'center',
    backgroundColor: colors.background,
    flex: 1,
    justifyContent: 'center',
  },
  screen: {
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  heroCard: {
    backgroundColor: colors.card,
    borderColor: colors.cardBorder,
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.xl,
  },
  teamsRow: {
    alignItems: 'center',
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    marginTop: spacing.lg,
  },
  team: {
    alignItems: 'center',
    flex: 1,
  },
  flag: {
    fontSize: 56,
    marginBottom: spacing.sm,
  },
  teamName: {
    color: colors.text,
    fontSize: font.heading,
    fontWeight: '800',
  },
  scoreOrVs: {
    color: colors.accent,
    fontSize: font.title,
    fontWeight: '900',
    minWidth: 80,
    textAlign: 'center',
  },
  infoCard: {
    backgroundColor: colors.card,
    borderColor: colors.cardBorder,
    borderRadius: radius.lg,
    borderWidth: 1,
    marginTop: spacing.lg,
    padding: spacing.lg,
  },
  infoRow: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
  },
  infoLabel: {
    color: colors.textMuted,
    fontSize: font.body,
  },
  infoValue: {
    color: colors.text,
    fontSize: font.body,
    fontWeight: '700',
  },
  watchButton: {
    alignItems: 'center',
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    marginTop: spacing.xl,
    padding: spacing.lg,
  },
  pressed: {
    opacity: 0.8,
  },
  watchButtonText: {
    color: colors.accentDark,
    fontSize: font.body,
    fontWeight: '900',
  },
  lockedCard: {
    alignItems: 'center',
    backgroundColor: colors.card,
    borderColor: colors.locked,
    borderRadius: radius.lg,
    borderStyle: 'dashed',
    borderWidth: 1,
    marginTop: spacing.xl,
    padding: spacing.xl,
  },
  lockedTitle: {
    color: colors.text,
    fontSize: font.heading,
    fontWeight: '800',
  },
  lockedHint: {
    color: colors.textMuted,
    fontSize: font.small,
    lineHeight: 20,
    marginTop: spacing.sm,
    textAlign: 'center',
  },
  unlockLink: {
    marginTop: spacing.md,
  },
  unlockLinkText: {
    color: colors.accent,
    fontSize: font.body,
    fontWeight: '700',
  },
  legal: {
    color: colors.locked,
    fontSize: font.tiny,
    marginTop: spacing.xl,
    textAlign: 'center',
  },
});
