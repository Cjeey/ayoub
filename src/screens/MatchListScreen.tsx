import React, { useMemo } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  SectionList,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { MatchCard } from '../components/MatchCard';
import { Match } from '../data/mockMatches';
import { t } from '../i18n/strings';
import { RootScreenProps } from '../navigation/types';
import { useFixtures } from '../storage/useFixtures';
import { colors, font, radius, spacing } from '../theme/theme';
import { dateLabel, kickoffTime, localDateKey } from '../utils/date';

interface DaySection {
  title: string;
  data: Match[];
}

export function MatchListScreen({ navigation }: RootScreenProps<'MatchList'>) {
  const { matches, loading, refreshing, refresh, lastSync, fromCache } = useFixtures();

  const sections = useMemo<DaySection[]>(() => {
    const byDay = new Map<string, Match[]>();
    for (const match of matches) {
      const key = localDateKey(match.kickoffISO);
      const list = byDay.get(key) ?? [];
      list.push(match);
      byDay.set(key, list);
    }
    return [...byDay.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, data]) => ({
        title: dateLabel(key),
        data: data.sort(
          (a, b) => new Date(a.kickoffISO).getTime() - new Date(b.kickoffISO).getTime(),
        ),
      }));
  }, [matches]);

  if (loading) {
    return (
      <View style={styles.loaderWrap}>
        <ActivityIndicator color={colors.accent} size="large" />
      </View>
    );
  }

  return (
    <SectionList
      style={styles.list}
      contentContainerStyle={styles.content}
      sections={sections}
      keyExtractor={(match) => match.id}
      stickySectionHeadersEnabled
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={refresh}
          tintColor={colors.accent}
          colors={[colors.accent]}
          progressBackgroundColor={colors.card}
        />
      }
      ListHeaderComponent={
        <Text style={styles.syncNote}>
          {fromCache ? `💾 ${t.fromCache}` : '🔄'}{' '}
          {lastSync ? `${t.lastSync}: ${kickoffTime(lastSync)}` : ''} — {t.pullToRefresh}
        </Text>
      }
      renderSectionHeader={({ section }) => (
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionHeaderText}>📅 {section.title}</Text>
        </View>
      )}
      renderItem={({ item }) => (
        <MatchCard
          match={item}
          onPress={(match) => navigation.navigate('MatchDetail', { matchId: match.id })}
        />
      )}
    />
  );
}

const styles = StyleSheet.create({
  loaderWrap: {
    alignItems: 'center',
    backgroundColor: colors.background,
    flex: 1,
    justifyContent: 'center',
  },
  list: {
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  syncNote: {
    color: colors.textMuted,
    fontSize: font.tiny,
    marginBottom: spacing.md,
    textAlign: 'center',
  },
  sectionHeader: {
    backgroundColor: colors.background,
    paddingBottom: spacing.sm,
    paddingTop: spacing.sm,
  },
  sectionHeaderText: {
    backgroundColor: colors.cardBorder,
    borderRadius: radius.sm,
    color: colors.text,
    fontSize: font.body,
    fontWeight: '800',
    overflow: 'hidden',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    textAlign: 'right',
  },
});
