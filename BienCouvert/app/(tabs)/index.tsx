// app/(tabs)/index.tsx — Écran principal : liste des contrats
import React, { useEffect } from 'react';
import { View, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, type Href } from 'expo-router';

import { useAuth } from '@/hooks/useAuth';
import { usePolicies } from '@/hooks/usePolicies';
import { PolicyList } from '@/components/PolicyList';
import { Policy } from '@/types';

export default function PoliciesScreen() {
  const { user } = useAuth();
  const { policies, isLoading, load, remove, update } = usePolicies(user?.id);

  useEffect(() => {
    load();
  }, [load]);

  const handleEdit = (policy: Policy) => {
    // Navigation vers l'onglet "add" avec l'ID de la police à éditer
    router.push({ pathname: '/(tabs)/add' as Href, params: { editId: policy.id } } as any);
  };

  return (
    <View style={styles.container}>
      {/* Stats rapides */}
      {policies.length > 0 && (
        <View style={styles.statsBar}>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{policies.length}</Text>
            <Text style={styles.statLabel}>Contrat{policies.length > 1 ? 's' : ''}</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>
              {policies.filter(p => p.annualPremium).length}
            </Text>
            <Text style={styles.statLabel}>Avec prime</Text>
          </View>
          <TouchableOpacity
            style={styles.addQuickBtn}
            onPress={() => router.push('/(tabs)/add' as Href)}
          >
            <Ionicons name="add" size={20} color="#0ea5e9" />
            <Text style={styles.addQuickText}>Ajouter</Text>
          </TouchableOpacity>
        </View>
      )}

      <PolicyList
        policies={policies}
        isLoading={isLoading}
        onEdit={handleEdit}
        onDelete={remove}
        onUpdatePolicy={update}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  statsBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    gap: 16,
  },
  statItem: { alignItems: 'center' },
  statValue: { fontSize: 18, fontWeight: '800', color: '#0f172a' },
  statLabel: { fontSize: 11, color: '#94a3b8', fontWeight: '500' },
  addQuickBtn: {
    marginLeft: 'auto',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#f0f9ff',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#bae6fd',
  },
  addQuickText: { color: '#0ea5e9', fontWeight: '700', fontSize: 13 },
});