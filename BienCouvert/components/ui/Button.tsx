import React from 'react';
import {
  TouchableOpacity,
  Text,
  ActivityIndicator,
  StyleSheet,
  ViewStyle,
  TextStyle,
} from 'react-native';

interface Props {
  onPress: () => void;
  label: string;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
}

export function Button({
  onPress,
  label,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  style,
}: Props) {
  const isDisabled = disabled || loading;

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={isDisabled}
      activeOpacity={0.75}
      style={[
        styles.base,
        styles[variant],
        styles[size],
        isDisabled && styles.disabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator
          size="small"
          color={variant === 'ghost' || variant === 'secondary' ? '#0ea5e9' : '#fff'}
        />
      ) : (
        <Text style={[styles.label, styles[`label_${variant}` as keyof typeof styles] as TextStyle]}>
          {label}
        </Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  // variants
  primary: { backgroundColor: '#0ea5e9' },
  secondary: { backgroundColor: '#f0f9ff', borderWidth: 1, borderColor: '#0ea5e9' },
  danger: { backgroundColor: '#ef4444' },
  ghost: { backgroundColor: 'transparent', borderWidth: 1, borderColor: '#e2e8f0' },
  // sizes
  sm: { paddingVertical: 8, paddingHorizontal: 16 },
  md: { paddingVertical: 12, paddingHorizontal: 24 },
  lg: { paddingVertical: 16, paddingHorizontal: 32 },
  // disabled
  disabled: { opacity: 0.5 },
  // labels
  label: { fontWeight: '700', fontSize: 15 },
  label_primary: { color: '#fff' },
  label_secondary: { color: '#0ea5e9' },
  label_danger: { color: '#fff' },
  label_ghost: { color: '#475569' },
});
