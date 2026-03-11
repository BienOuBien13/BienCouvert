// app/(tabs)/add.tsx — Écran d'ajout / modification de police
import React, { useState, useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { useLocalSearchParams, router, type Href } from 'expo-router';

import { useAuth } from '@/hooks/useAuth';
import { usePolicies } from '@/hooks/usePolicies';
import { AddPolicyForm } from '@/components/AddPolicyForm';
import { Policy } from '@/types';

export default function AddScreen() {
  const { user } = useAuth();
  const { policies, load, add, update } = usePolicies(user?.id);
  const params = useLocalSearchParams<{ editId?: string }>();
  const [editingPolicy, setEditingPolicy] = useState<Policy | null>(null);

  useEffect(() => {
    if (params.editId && policies.length > 0) {
      const found = policies.find(p => p.id === params.editId) || null;
      setEditingPolicy(found);
    }
  }, [params.editId, policies]);

  // Charger les polices si pas encore fait
  useEffect(() => { load(); }, [load]);

  if (!user) return null;

  const handleSave = async (policy: Policy) => {
    if (editingPolicy) {
      await update(policy);
    } else {
      await add(policy);
    }
    router.replace('/(tabs)' as Href);
  };

  return (
    <View style={styles.flex}>
      <AddPolicyForm
        user={user}
        editingPolicy={editingPolicy}
        onSave={handleSave}
        onCancel={() => router.back()}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#f8fafc' },
});
