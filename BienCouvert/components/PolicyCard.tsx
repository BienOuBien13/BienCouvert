// components/PolicyCard.tsx — Carte d'une police d'assurance
// Adapté depuis FrontEnd/components/PolicyList.tsx

import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Policy, PolicyType } from '../types';
import { Card } from './ui/Card';
import { formatCurrency, formatDate } from '../utils/formatters';

interface Props {
  policy: Policy;
  onEdit: (policy: Policy) => void;
  onDelete: (id: string) => void;
}

type IconConfig = { name: keyof typeof Ionicons.glyphMap; color: string; bg: string };

const TYPE_ICONS: Record<string, IconConfig> = {
  [PolicyType.AUTO]:      { name: 'car',               color: '#2563eb', bg: '#eff6ff' },
  [PolicyType.HOME]:      { name: 'home',              color: '#ea580c', bg: '#fff7ed' },
  [PolicyType.HEALTH]:    { name: 'heart',             color: '#16a34a', bg: '#f0fdf4' },
  [PolicyType.BANK_CARD]: { name: 'card',              color: '#4f46e5', bg: '#eef2ff' },
  [PolicyType.LOAN]:      { name: 'cash',              color: '#d97706', bg: '#fffbeb' },
  [PolicyType.MOBILE]:    { name: 'phone-portrait',    color: '#475569', bg: '#f8fafc' },
  [PolicyType.LEGAL]:     { name: 'scale',             color: '#7c3aed', bg: '#f5f3ff' },
  [PolicyType.LIFE]:      { name: 'briefcase',         color: '#e11d48', bg: '#fff1f2' },
};
const DEFAULT_ICON: IconConfig = { name: 'shield-checkmark', color: '#64748b', bg: '#f8fafc' };

export function PolicyCard({ policy, onEdit, onDelete }: Props) {
  const [expanded, setExpanded] = useState(false);
  const iconCfg = TYPE_ICONS[policy.type] ?? DEFAULT_ICON;

  const handleDelete = () => {
    Alert.alert(
      'Supprimer cette police ?',
      `${policy.name} — ${policy.insurer}`,
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Supprimer', style: 'destructive', onPress: () => onDelete(policy.id) },
      ],
    );
  };

  return (
    <Card elevated style={styles.card}>
      <TouchableOpacity
        onPress={() => setExpanded(e => !e)}
        activeOpacity={0.8}
        style={styles.header}
      >
        {/* Icône colorée par type — identique au web */}
        <View style={[styles.typeIcon, { backgroundColor: expanded ? '#0ea5e9' : iconCfg.bg }]}>
          <Ionicons
            name={iconCfg.name}
            size={24}
            color={expanded ? '#fff' : iconCfg.color}
          />
        </View>

        <View style={styles.headerMid}>
          <Text style={styles.name} numberOfLines={1}>{policy.name}</Text>
          <Text style={styles.insurer}>{policy.insurer}</Text>
        </View>

        <View style={styles.headerRight}>
          {policy.annualPremium != null && (
            <Text style={styles.premium}>{formatCurrency(policy.annualPremium)}/an</Text>
          )}
          <Ionicons
            name={expanded ? 'chevron-up' : 'chevron-down'}
            size={18}
            color="#94a3b8"
          />
        </View>
      </TouchableOpacity>

      {expanded && (
        <View style={styles.details}>
          {policy.summary ? (
            <Text style={styles.summary}>{policy.summary}</Text>
          ) : null}

          {policy.formula || policy.coverageDetail ? (
            <View style={styles.row}>
              <Ionicons name="shield-outline" size={14} color="#0ea5e9" />
              <Text style={styles.infoText}>
                Formule : {policy.formula || policy.coverageDetail}
              </Text>
            </View>
          ) : null}

          {policy.options && policy.options.length > 0 ? (
            <View style={styles.options}>
              {policy.options.map((opt, i) => (
                <View key={i} style={styles.optionChip}>
                  <Text style={styles.optionText}>{opt}</Text>
                </View>
              ))}
            </View>
          ) : null}

          <View style={styles.row}>
            <Ionicons name="calendar-outline" size={14} color="#94a3b8" />
            <Text style={styles.infoTextMuted}>Ajouté le {formatDate(policy.addedAt)}</Text>
          </View>

          {policy.sourceUrl ? (
            <TouchableOpacity
              style={styles.row}
              onPress={() => policy.sourceUrl && Linking.openURL(policy.sourceUrl)}
            >
              <Ionicons name="document-text-outline" size={14} color="#0ea5e9" />
              <Text style={styles.linkText}>Voir les Conditions Générales</Text>
            </TouchableOpacity>
          ) : null}

          {/* Actions */}
          <View style={styles.actions}>
            <TouchableOpacity style={styles.actionBtn} onPress={() => onEdit(policy)}>
              <Ionicons name="pencil-outline" size={16} color="#0ea5e9" />
              <Text style={styles.actionTextPrimary}>Modifier</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.actionBtn, styles.deleteBtn]} onPress={handleDelete}>
              <Ionicons name="trash-outline" size={16} color="#ef4444" />
              <Text style={styles.actionTextDanger}>Supprimer</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { marginHorizontal: 16, marginVertical: 6 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  typeIcon: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  headerMid: { flex: 1, gap: 2 },
  headerRight: { alignItems: 'flex-end', gap: 4 },
  name: { fontSize: 15, fontWeight: '700', color: '#0f172a' },
  insurer: { fontSize: 12, color: '#64748b' },
  premium: { fontSize: 14, fontWeight: '800', color: '#0ea5e9' },
  details: { marginTop: 12, gap: 8, borderTopWidth: 1, borderTopColor: '#f1f5f9', paddingTop: 12 },
  summary: { fontSize: 13, color: '#475569', lineHeight: 20 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  infoText: { fontSize: 13, color: '#334155', fontWeight: '500' },
  infoTextMuted: { fontSize: 12, color: '#94a3b8' },
  linkText: { fontSize: 13, color: '#0ea5e9', textDecorationLine: 'underline' },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  optionChip: {
    backgroundColor: '#f0f9ff',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: '#bae6fd',
  },
  optionText: { fontSize: 11, color: '#0369a1', fontWeight: '600' },
  actions: { flexDirection: 'row', gap: 12, marginTop: 4 },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#f0f9ff',
  },
  deleteBtn: { backgroundColor: '#fef2f2' },
  actionTextPrimary: { color: '#0ea5e9', fontWeight: '600', fontSize: 13 },
  actionTextDanger: { color: '#ef4444', fontWeight: '600', fontSize: 13 },
});
