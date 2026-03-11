// app/(auth)/login.tsx — Écran de connexion
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { router, type Href } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { useAuth } from '@/hooks/useAuth';
import { AuthScreen } from '@/components/AuthScreen';
import { User } from '@/types';

export default function LoginScreen() {
  const { login } = useAuth();

  const handleLogin = (user: User) => {
    router.replace('/(tabs)' as Href);
  };

  return (
    <View style={styles.flex}>
      <StatusBar style="dark" />
      <AuthScreen onLogin={handleLogin} />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#f8fafc' },
});
