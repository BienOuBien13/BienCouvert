// components/PolicyList.tsx — Liste des polices
// Exact rebuild from FrontEnd/components/PolicyList.tsx

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
  onUpdatePolicy?: (policy: Policy) => void;
  onViewCoverage?: (policy: Policy) => void;
}

export function PolicyList({
  policies,
  isLoading,
  onEdit,
  onDelete,
  onUpdatePolicy,
  onViewCoverage,
}: Props) {
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
        <Text style={styles.emptyTitle}>Votre portefeuille est vide</Text>
        <Text style={styles.emptySubtitle}>
          Ajoutez votre premier contrat d'assurance pour commencer.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header — matching web: Mon Portefeuille (count) */}
      <View style={styles.headerRow}>
        <Text style={styles.headerTitle}>
          Mon Portefeuille ({policies.length})
        </Text>
      </View>

      <FlatList
        data={policies}
        keyExtractor={(p) => p.id}
        renderItem={({ item }) => (
          <PolicyCard
            policy={item}
            onEdit={onEdit}
            onDelete={onDelete}
            onUpdatePolicy={onUpdatePolicy}
            onViewCoverage={onViewCoverage}
          />
        )}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerRow: {
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  headerTitle: {
    fontWeight: '900',
    color: '#0f172a',
    textTransform: 'uppercase',
    letterSpacing: -0.5,
    fontSize: 16,
  },
  list: { paddingVertical: 4, paddingBottom: 100 },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 12,
  },
  loadingText: { color: '#64748b', fontSize: 14 },
  emptyIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#94a3b8',
    textAlign: 'center',
  },
});
