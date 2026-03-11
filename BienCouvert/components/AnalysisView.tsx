// components/AnalysisView.tsx — Détection d'optimisations adaptée RN
// Adapté depuis FrontEnd/components/AnalysisView.tsx

import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Policy, OptimizationFinding, UserProfileData, User } from '../types';
import { detectOptimizations } from '../services/geminiService';
import { Card } from './ui/Card';
import { Button } from './ui/Button';
import { formatCurrency } from '../utils/formatters';

interface Props {
  policies: Policy[];
  profile: UserProfileData;
  user: User;
}

const SEVERITY_COLORS: Record<string, string> = {
  high: '#ef4444',
  medium: '#f59e0b',
  low: '#22c55e',
};

const TYPE_CONFIG = {
  duplicate: { bg: '#fffbeb', text: '#d97706', icon: 'copy-outline' as const },
  gap:       { bg: '#fef2f2', text: '#dc2626', icon: 'warning-outline' as const },
  saving:    { bg: '#f0fdf4', text: '#16a34a', icon: 'trending-down-outline' as const },
};

export function AnalysisView({ policies, profile, user }: Props) {
  const [findings, setFindings] = useState<OptimizationFinding[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasRun, setHasRun] = useState(false);

  const runAnalysis = async () => {
    setIsLoading(true);
    try {
      const results = await detectOptimizations(policies, profile);
      setFindings(results);
      setHasRun(true);
    } catch {
      // ignore
    } finally {
      setIsLoading(false);
    }
  };

  const totalSaving = findings.reduce((s, f) => s + (f.estimatedSaving || 0), 0);

  if (!hasRun) {
    return (
      <View style={styles.startContainer}>
        <View style={styles.startIcon}>
          <Ionicons name="sparkles" size={40} color="#0ea5e9" />
        </View>
        <Text style={styles.startTitle}>Analyse de votre portefeuille</Text>
        <Text style={styles.startSubtitle}>
          Notre IA analyse vos {policies.length} contrat{policies.length > 1 ? 's' : ''} pour{'\n'}
          détecter les doublons, lacunes et économies potentielles.
        </Text>
        <Button
          label="Lancer l'analyse"
          onPress={runAnalysis}
          loading={isLoading}
          style={styles.startBtn}
        />
      </View>
    );
  }

  if (isLoading) {
    return (
      <View style={styles.startContainer}>
        <ActivityIndicator size="large" color="#0ea5e9" />
        <Text style={styles.startSubtitle}>Analyse en cours…</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.container}>
      {/* Résumé */}
      <Card elevated style={styles.summaryCard}>
        <Text style={styles.summaryFindings}>{findings.length} recommandation{findings.length > 1 ? 's' : ''}</Text>
        {totalSaving > 0 && (
          <Text style={styles.summarySaving}>
            💡 Économie potentielle : {formatCurrency(totalSaving)}/an
          </Text>
        )}
        <Button label="Relancer l'analyse" variant="secondary" onPress={runAnalysis} style={styles.rerunBtn} />
      </Card>

      {findings.length === 0 ? (
        <Card style={styles.nothingCard}>
          <Ionicons name="checkmark-circle" size={32} color="#22c55e" />
          <Text style={styles.nothingText}>Portefeuille optimisé !</Text>
          <Text style={styles.nothingSubtext}>Aucune recommandation particulière pour vos contrats actuels.</Text>
        </Card>
      ) : (
        findings.map((f, idx) => {
          const cfg = TYPE_CONFIG[f.type] ?? TYPE_CONFIG.saving;
          return (
            <Card key={idx} elevated style={StyleSheet.flatten([styles.findingCard, { borderLeftColor: cfg.text }])}>
              <View style={styles.findingHeader}>
                <View style={[styles.findingIcon, { backgroundColor: cfg.bg }]}>
                  <Ionicons name={cfg.icon} size={20} color={cfg.text} />
                </View>
                <View style={styles.findingHeaderText}>
                  <Text style={styles.findingTitle}>{f.title}</Text>
                  <View style={[styles.severityDot, { backgroundColor: SEVERITY_COLORS[f.severity] }]} />
                </View>
              </View>
              <Text style={styles.findingDesc}>{f.description}</Text>
              {f.estimatedSaving != null && f.estimatedSaving > 0 && (
                <View style={styles.savingBadge}>
                  <Text style={styles.savingText}>💰 {formatCurrency(f.estimatedSaving)}/an d'économie</Text>
                </View>
              )}
              <View style={styles.recommendationBox}>
                <Text style={styles.recommendationLabel}>Recommandation</Text>
                <Text style={styles.recommendationText}>{f.recommendation}</Text>
              </View>
            </Card>
          );
        })
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#f8fafc' },
  container: { padding: 16, paddingBottom: 40, gap: 12 },
  startContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 16,
    backgroundColor: '#f8fafc',
  },
  startIcon: {
    width: 80,
    height: 80,
    borderRadius: 24,
    backgroundColor: '#e0f2fe',
    alignItems: 'center',
    justifyContent: 'center',
  },
  startTitle: { fontSize: 22, fontWeight: '800', color: '#0f172a', textAlign: 'center' },
  startSubtitle: { fontSize: 14, color: '#64748b', textAlign: 'center', lineHeight: 22 },
  startBtn: { width: '80%', marginTop: 8 },
  summaryCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 },
  summaryFindings: { fontSize: 16, fontWeight: '800', color: '#0f172a' },
  summarySaving: { fontSize: 13, color: '#16a34a', fontWeight: '600' },
  rerunBtn: { alignSelf: 'flex-end' },
  nothingCard: { alignItems: 'center', gap: 8, padding: 24 },
  nothingText: { fontSize: 18, fontWeight: '700', color: '#0f172a' },
  nothingSubtext: { fontSize: 13, color: '#64748b', textAlign: 'center' },
  findingCard: { borderLeftWidth: 4 },
  findingHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 8 },
  findingIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  findingHeaderText: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  findingTitle: { fontSize: 15, fontWeight: '700', color: '#0f172a', flex: 1 },
  severityDot: { width: 8, height: 8, borderRadius: 4 },
  findingDesc: { fontSize: 13, color: '#475569', lineHeight: 20, marginBottom: 8 },
  savingBadge: {
    backgroundColor: '#f0fdf4',
    borderRadius: 8,
    padding: 8,
    borderWidth: 1,
    borderColor: '#bbf7d0',
    marginBottom: 8,
  },
  savingText: { fontSize: 13, color: '#15803d', fontWeight: '700' },
  recommendationBox: {
    backgroundColor: '#f8fafc',
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  recommendationLabel: { fontSize: 11, fontWeight: '800', color: '#0ea5e9', marginBottom: 4, textTransform: 'uppercase' },
  recommendationText: { fontSize: 13, color: '#0f172a', lineHeight: 20 },
});
