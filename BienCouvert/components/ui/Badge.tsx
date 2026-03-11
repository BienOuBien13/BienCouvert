import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { PolicyType } from '../../types';

const TYPE_COLORS: Record<string, { bg: string; text: string; emoji: string }> = {
  [PolicyType.AUTO]:      { bg: '#dbeafe', text: '#1d4ed8', emoji: '🚗' },
  [PolicyType.HOME]:      { bg: '#dcfce7', text: '#15803d', emoji: '🏠' },
  [PolicyType.HEALTH]:    { bg: '#fee2e2', text: '#b91c1c', emoji: '❤️' },
  [PolicyType.LEGAL]:     { bg: '#ede9fe', text: '#7c3aed', emoji: '⚖️' },
  [PolicyType.LIFE]:      { bg: '#fce7f3', text: '#be185d', emoji: '🛡️' },
  [PolicyType.BANK_CARD]: { bg: '#fef9c3', text: '#854d0e', emoji: '💳' },
  [PolicyType.LOAN]:      { bg: '#ffedd5', text: '#c2410c', emoji: '🏦' },
  [PolicyType.MOBILE]:    { bg: '#cffafe', text: '#0e7490', emoji: '📱' },
  [PolicyType.OTHER]:     { bg: '#f1f5f9', text: '#475569', emoji: '📄' },
};

interface Props {
  type: PolicyType | string;
  size?: 'sm' | 'md';
  style?: ViewStyle;
}

export function Badge({ type, size = 'md', style }: Props) {
  const config = TYPE_COLORS[type] || TYPE_COLORS[PolicyType.OTHER];
  const isSmall = size === 'sm';

  return (
    <View style={[styles.base, { backgroundColor: config.bg }, isSmall && styles.small, style]}>
      <Text style={[styles.text, { color: config.text }, isSmall && styles.smallText]}>
        {config.emoji} {type}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
    alignSelf: 'flex-start',
  },
  small: { paddingHorizontal: 7, paddingVertical: 2 },
  text: { fontSize: 12, fontWeight: '700' },
  smallText: { fontSize: 10 },
});
