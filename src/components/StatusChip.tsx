import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Match } from '../data/mockMatches';
import { t } from '../i18n/strings';
import { colors, font, radius, spacing } from '../theme/theme';

export function StatusChip({ status }: { status: Match['status'] }) {
  const label =
    status === 'live' ? t.statusLive : status === 'finished' ? t.statusFinished : t.statusUpcoming;
  return (
    <View
      style={[
        styles.chip,
        status === 'live' && styles.chipLive,
        status === 'finished' && styles.chipFinished,
      ]}
    >
      <Text style={[styles.text, status === 'live' && styles.textLive]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    alignSelf: 'center',
    backgroundColor: colors.cardBorder,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  chipLive: {
    backgroundColor: 'rgba(229, 57, 53, 0.18)',
    borderColor: colors.live,
    borderWidth: 1,
  },
  chipFinished: {
    backgroundColor: 'transparent',
    borderColor: colors.locked,
    borderWidth: 1,
  },
  text: {
    color: colors.text,
    fontSize: font.tiny,
    fontWeight: '700',
  },
  textLive: {
    color: colors.live,
  },
});
