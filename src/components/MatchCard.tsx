import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Match } from '../data/mockMatches';
import { t } from '../i18n/strings';
import { colors, font, radius, spacing } from '../theme/theme';
import { kickoffTime } from '../utils/date';
import { StatusChip } from './StatusChip';

interface Props {
  match: Match;
  onPress: (match: Match) => void;
}

export function MatchCard({ match, onPress }: Props) {
  const hasScore = match.status !== 'upcoming';
  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      onPress={() => onPress(match)}
      accessibilityRole="button"
      accessibilityLabel={`${match.home.nameAr} ${t.vs} ${match.away.nameAr}`}
    >
      <View style={styles.topRow}>
        <Text style={styles.groupText}>
          {t.group} {match.group} · {t.demoTag}
        </Text>
        <StatusChip status={match.status} />
      </View>

      <View style={styles.teamsRow}>
        <View style={styles.team}>
          <Text style={styles.flag}>{match.home.flag}</Text>
          <Text style={styles.teamName} numberOfLines={1}>
            {match.home.nameAr}
          </Text>
        </View>

        <View style={styles.center}>
          {hasScore ? (
            <Text style={styles.score}>
              {match.homeScore ?? 0} - {match.awayScore ?? 0}
            </Text>
          ) : (
            <Text style={styles.time}>{kickoffTime(match.kickoffISO)}</Text>
          )}
        </View>

        <View style={styles.team}>
          <Text style={styles.flag}>{match.away.flag}</Text>
          <Text style={styles.teamName} numberOfLines={1}>
            {match.away.nameAr}
          </Text>
        </View>
      </View>

      <Text style={styles.venue} numberOfLines={1}>
        🏟️ {match.stadium} — {match.city}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderColor: colors.cardBorder,
    borderRadius: radius.lg,
    borderWidth: 1,
    marginBottom: spacing.md,
    padding: spacing.lg,
  },
  cardPressed: {
    opacity: 0.8,
  },
  topRow: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  groupText: {
    color: colors.textMuted,
    fontSize: font.small,
  },
  teamsRow: {
    alignItems: 'center',
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
  },
  team: {
    alignItems: 'center',
    flex: 1,
  },
  flag: {
    fontSize: 34,
    marginBottom: spacing.xs,
  },
  teamName: {
    color: colors.text,
    fontSize: font.body,
    fontWeight: '700',
  },
  center: {
    alignItems: 'center',
    minWidth: 70,
  },
  score: {
    color: colors.accent,
    fontSize: font.heading,
    fontWeight: '800',
  },
  time: {
    color: colors.text,
    fontSize: font.heading,
    fontVariant: ['tabular-nums'],
    fontWeight: '800',
  },
  venue: {
    color: colors.textMuted,
    fontSize: font.small,
    marginTop: spacing.md,
    textAlign: 'right',
  },
});
