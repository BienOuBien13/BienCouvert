// app/(tabs)/profile.tsx — Écran profil utilisateur
import React from 'react';
import { View, StyleSheet } from 'react-native';
import { router, type Href } from 'expo-router';

import { useAuth } from '@/hooks/useAuth';
import { UserProfile } from '@/components/UserProfile';

export default function ProfileScreen() {
  const { user, logout, updateUser } = useAuth();

  if (!user) return null;

  const handleLogout = async () => {
    await logout();
    router.replace('/(auth)/login' as Href);
  };

  return (
    <View style={styles.flex}>
      <UserProfile
        user={user}
        onUpdateUser={updateUser}
        onLogout={handleLogout}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
});
