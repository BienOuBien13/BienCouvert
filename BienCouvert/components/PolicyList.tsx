// components/PolicyList.tsx — Liste des polices
// Adapté depuis FrontEnd/components/PolicyList.tsx

import React from 'react';
import {
  View,
  FlatList,
  Text,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Policy } from '../types';
import { PolicyCard } from './PolicyCard';

interface Props {
  policies: Policy[];
  isLoading: boolean;
  onEdit: (policy: Policy) => void;
  onDelete: (id: string) => void;
}

export function PolicyList({ policies, isLoading, onEdit, onDelete }: Props) {
  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#0ea5e9" />
        <Text style={styles.loadingText}>Chargement de vos contrats…</Text>
      </View>
    );
  }

  if (policies.length === 0) {
    return (
      <View style={styles.centered}>
        <View style={styles.emptyIcon}>
          <Ionicons name="shield-outline" size={48} color="#cbd5e1" />
        </View>
        <Text style={styles.emptyTitle}>Aucun contrat</Text>
        <Text style={styles.emptySubtitle}>
          Ajoutez votre premier contrat d'assurance pour commencer.
        </Text>
      </View>
    );
  }

  return (
    <FlatList
      data={policies}
      keyExtractor={p => p.id}
      renderItem={({ item }) => (
        <PolicyCard policy={item} onEdit={onEdit} onDelete={onDelete} />
      )}
      contentContainerStyle={styles.list}
      showsVerticalScrollIndicator={false}
    />
  );
}

const styles = StyleSheet.create({
  list: { paddingVertical: 8, paddingBottom: 100 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 },
  loadingText: { color: '#64748b', fontSize: 14 },
  emptyIcon: {
    width: 80,
    height: 80,
    borderRadius: 20,
    backgroundColor: '#f8fafc',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#0f172a' },
  emptySubtitle: { fontSize: 14, color: '#64748b', textAlign: 'center' },
});
