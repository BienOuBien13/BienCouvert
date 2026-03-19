// components/PolicyCard.tsx — Carte police d'assurance
// Exact rebuild from FrontEnd/components/PolicyList.tsx card rendering

import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Linking,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Policy, PolicyType } from '../types';
import { Card } from './ui/Card';
import { Button } from './ui/Button';
import { formatCurrency, formatDate } from '../utils/formatters';
import { searchPolicyInfo } from '../services/geminiService';
import { storageService } from '../services/storageService';
import { apiFetch } from '../services/api';
import {
  getInsuranceSubTypes,
  type InsuranceSubType,
} from '../services/masterDataService';

interface Props {
  policy: Policy;
  onEdit: (policy: Policy) => void;
  onDelete: (id: string) => void;
  onUpdatePolicy?: (policy: Policy) => void;
  onViewCoverage?: (policy: Policy) => void;
}

type IconConfig = {
  name: keyof typeof Ionicons.glyphMap;
  color: string;
  bg: string;
};

const TYPE_ICONS: Record<string, IconConfig> = {
  [PolicyType.AUTO]: { name: 'car', color: '#2563eb', bg: '#eff6ff' },
  [PolicyType.HOME]: { name: 'home', color: '#ea580c', bg: '#fff7ed' },
  [PolicyType.HEALTH]: { name: 'heart', color: '#16a34a', bg: '#f0fdf4' },
  [PolicyType.BANK_CARD]: { name: 'card', color: '#4f46e5', bg: '#eef2ff' },
  [PolicyType.LOAN]: { name: 'cash', color: '#d97706', bg: '#fffbeb' },
  [PolicyType.MOBILE]: {
    name: 'phone-portrait',
    color: '#475569',
    bg: '#f8fafc',
  },
  [PolicyType.LEGAL]: { name: 'scale', color: '#7c3aed', bg: '#f5f3ff' },
  [PolicyType.LIFE]: { name: 'briefcase', color: '#e11d48', bg: '#fff1f2' },
};
const DEFAULT_ICON: IconConfig = {
  name: 'shield-checkmark',
  color: '#64748b',
  bg: '#f8fafc',
};

export function PolicyCard({
  policy,
  onEdit,
  onDelete,
  onUpdatePolicy,
  onViewCoverage,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const [isSearchingLink, setIsSearchingLink] = useState(false);

  // Inline edit state
  const [isEditing, setIsEditing] = useState(false);
  const [editFormula, setEditFormula] = useState('');
  const [editSummary, setEditSummary] = useState('');
  const [editSubTypeCode, setEditSubTypeCode] = useState('');
  const [editOptions, setEditOptions] = useState<string[]>([]);

  // Fetched data for inline edit
  const [availableFormulas, setAvailableFormulas] = useState<string[]>([]);
  const [subTypes, setSubTypes] = useState<InsuranceSubType[]>([]);
  const [availableOptions, setAvailableOptions] = useState<
    Array<{
      guarantee_label: string;
      guarantee_key: string;
      isSubscribed: boolean;
      coverage_amount: string | null;
      coverage_notes: string | null;
    }>
  >([]);
  const [isLoadingFormulas, setIsLoadingFormulas] = useState(false);
  const [isLoadingSubTypes, setIsLoadingSubTypes] = useState(false);
  const [isLoadingOptions, setIsLoadingOptions] = useState(false);

  const iconCfg = TYPE_ICONS[policy.type] ?? DEFAULT_ICON;

  const handleDelete = () => {
    Alert.alert(
      'Supprimer cette police ?',
      `${policy.name} — ${policy.insurer}`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: () => onDelete(policy.id),
        },
      ],
    );
  };

  const handleRepairLink = async () => {
    setIsSearchingLink(true);
    try {
      const result = await searchPolicyInfo(policy.name, policy.insurer);
      if (result.sourceUrl && onUpdatePolicy) {
        onUpdatePolicy({
          ...policy,
          sourceUrl: result.sourceUrl,
          summary: result.summary,
        });
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsSearchingLink(false);
    }
  };

  const openInlineEdit = async () => {
    setIsEditing(true);
    setEditSummary(policy.summary || '');
    setEditFormula(policy.formula || policy.coverageDetail || '');
    setEditSubTypeCode(policy.subTypeCode || '');
    setEditOptions(policy.options || []);
    setAvailableFormulas([]);
    setSubTypes([]);
    setAvailableOptions([]);

    const insurerCode = policy.insurerCode;
    const typeCode = policy.typeCode;

    // Fetch formulas from CG central
    if (insurerCode && typeCode) {
      setIsLoadingFormulas(true);
      try {
        const data = await apiFetch<{
          formules?: string[];
        }>(
          `/cg/central/by-type-and-insurer?insurance_type_code=${encodeURIComponent(typeCode)}&insurer_code=${encodeURIComponent(insurerCode)}`,
        );
        if (data?.formules?.length) setAvailableFormulas(data.formules);
      } catch {
        /* ignore */
      } finally {
        setIsLoadingFormulas(false);
      }
    }

    // Fetch sub-types
    if (typeCode) {
      setIsLoadingSubTypes(true);
      getInsuranceSubTypes(typeCode)
        .then((subs) => setSubTypes(subs))
        .catch(() => {})
        .finally(() => setIsLoadingSubTypes(false));
    }

    // Fetch available options
    setIsLoadingOptions(true);
    storageService
      .getAvailableOptions(policy.id)
      .then((data) => {
        if (data) {
          setAvailableOptions(data.availableOptions);
          const backendSubscribed = data.availableOptions
            .filter((o) => o.isSubscribed)
            .map((o) => o.guarantee_label);
          if (backendSubscribed.length > 0) setEditOptions(backendSubscribed);
        }
      })
      .catch(() => {})
      .finally(() => setIsLoadingOptions(false));
  };

  const closeInlineEdit = () => {
    setIsEditing(false);
    setSubTypes([]);
    setAvailableOptions([]);
  };

  const saveInlineEdit = async () => {
    if (onUpdatePolicy) {
      onUpdatePolicy({
        ...policy,
        summary: editSummary,
        formula: editFormula,
        options: editOptions,
        subTypeCode: editSubTypeCode || undefined,
        subTypeLabel: subTypes.find((s) => s.code === editSubTypeCode)?.label,
      });
    }
    try {
      await storageService.updatePolicyOptions(policy.id, {
        formula: editFormula,
        options: editOptions,
        subTypeCode: editSubTypeCode || undefined,
      });
    } catch (e) {
      console.error('Erreur PATCH options:', e);
    }
    closeInlineEdit();
  };

  const cgUrl = (policy as any).cgUrl || policy.sourceUrl;

  return (
    <View
      style={[
        styles.card,
        expanded && styles.cardExpanded,
      ]}
    >
      {/* Header — tap to expand */}
      <TouchableOpacity
        onPress={() => setExpanded((e) => !e)}
        activeOpacity={0.8}
        style={styles.header}
      >
        <View
          style={[
            styles.typeIcon,
            {
              backgroundColor: expanded ? '#0ea5e9' : iconCfg.bg,
            },
          ]}
        >
          <Ionicons
            name={iconCfg.name}
            size={28}
            color={expanded ? '#fff' : iconCfg.color}
          />
        </View>

        <View style={styles.headerMid}>
          <Text style={styles.name} numberOfLines={1}>
            {policy.name}
          </Text>
          <View style={styles.badgeRow}>
            <Text style={styles.insurer}>{policy.insurer}</Text>
            {policy.subTypeLabel && (
              <View style={styles.subTypeBadge}>
                <Ionicons name="layers-outline" size={10} color="#4f46e5" />
                <Text style={styles.subTypeBadgeText}>
                  {policy.subTypeLabel}
                </Text>
              </View>
            )}
            {policy.coverageDetail && (
              <View style={styles.formulaBadge}>
                <Text style={styles.formulaBadgeText}>
                  {policy.coverageDetail}
                </Text>
              </View>
            )}
          </View>
        </View>

        <View style={styles.headerRight}>
          {policy.sourceUrl && (
            <Ionicons name="checkmark-circle" size={18} color="#22c55e" />
          )}
          <Ionicons
            name={expanded ? 'chevron-up' : 'chevron-down'}
            size={18}
            color="#94a3b8"
          />
        </View>
      </TouchableOpacity>

      {/* Expanded content */}
      {expanded && (
        <View style={styles.expandedContent}>
          {/* Premium + date */}
          <View style={styles.metaRow}>
            {policy.annualPremium != null && (
              <View style={styles.premiumBadge}>
                <Ionicons name="logo-euro" size={12} color="#059669" />
                <Text style={styles.premiumText}>
                  {policy.annualPremium.toLocaleString('fr-FR')} / an
                </Text>
              </View>
            )}
            {policy.addedAt && (
              <Text style={styles.dateText}>
                Ajouté le {formatDate(policy.addedAt)}
              </Text>
            )}
          </View>

          {/* Formula / sub-type / options gradient card */}
          {(policy.formula ||
            policy.coverageDetail ||
            policy.subTypeLabel ||
            (policy.options && policy.options.length > 0)) && (
            <View style={styles.formulaCard}>
              {policy.subTypeLabel && (
                <View>
                  <View style={styles.labelRow}>
                    <Ionicons name="layers-outline" size={12} color="#4338ca" />
                    <Text style={styles.formulaLabel}>TYPE DE CONTRAT</Text>
                  </View>
                  <Text style={styles.subTypeValue}>
                    {policy.subTypeLabel}
                  </Text>
                </View>
              )}
              {(policy.formula || policy.coverageDetail) && (
                <View>
                  <View style={styles.labelRow}>
                    <Ionicons name="flash-outline" size={12} color="#0369a1" />
                    <Text style={styles.formulaLabel}>FORMULE SOUSCRITE</Text>
                  </View>
                  <Text style={styles.formulaValue}>
                    {policy.formula || policy.coverageDetail}
                  </Text>
                </View>
              )}
              {policy.options && policy.options.length > 0 && (
                <View>
                  <Text style={styles.formulaLabel}>OPTIONS CHOISIES</Text>
                  <View style={styles.optionChips}>
                    {policy.options.map((opt) => (
                      <View key={opt} style={styles.optionChip}>
                        <Ionicons
                          name="checkmark"
                          size={10}
                          color="#0369a1"
                        />
                        <Text style={styles.optionChipText}>{opt}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}
            </View>
          )}

          {/* CG document */}
          <View style={styles.cgSection}>
            <View style={styles.labelRow}>
              <Ionicons name="document-text-outline" size={12} color="#94a3b8" />
              <Text style={styles.cgLabel}>DOCUMENT DE RÉFÉRENCE</Text>
            </View>
            {cgUrl ? (
              <TouchableOpacity
                style={styles.cgLink}
                onPress={() => Linking.openURL(cgUrl)}
              >
                <View style={styles.cgLinkContent}>
                  <Ionicons
                    name="document-text"
                    size={18}
                    color="#fff"
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cgLinkTitle}>
                      Conditions Générales PDF
                    </Text>
                    <Text style={styles.cgLinkHost} numberOfLines={1}>
                      {(() => {
                        try {
                          return new URL(cgUrl).hostname;
                        } catch {
                          return cgUrl;
                        }
                      })()}
                    </Text>
                  </View>
                  <Ionicons
                    name="open-outline"
                    size={16}
                    color="#94a3b8"
                  />
                </View>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={styles.cgSearchBtn}
                onPress={handleRepairLink}
                disabled={isSearchingLink}
              >
                {isSearchingLink ? (
                  <ActivityIndicator size="small" color="#0ea5e9" />
                ) : (
                  <Ionicons name="search" size={20} color="#94a3b8" />
                )}
                <Text style={styles.cgSearchText}>
                  Rechercher les conditions chez {policy.insurer}
                </Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Summary */}
          {policy.summary && (
            <View>
              <View style={styles.labelRow}>
                <Ionicons
                  name="information-circle-outline"
                  size={12}
                  color="#0ea5e9"
                />
                <Text style={styles.cgLabel}>DESCRIPTION COURTE</Text>
              </View>
              <View style={styles.summaryBox}>
                <Text style={styles.summaryText}>{policy.summary}</Text>
              </View>
            </View>
          )}

          {/* Actions */}
          {onViewCoverage && (
            <TouchableOpacity
              style={styles.coverageBtn}
              onPress={() => onViewCoverage(policy)}
            >
              <Ionicons name="list-outline" size={16} color="#fff" />
              <Text style={styles.coverageBtnText}>
                VOIR LES GARANTIES DE CETTE FORMULE
              </Text>
            </TouchableOpacity>
          )}

          <View style={styles.actionRow}>
            <TouchableOpacity
              style={styles.editBtn}
              onPress={() => openInlineEdit()}
            >
              <Text style={styles.editBtnText}>MODIFIER</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.deleteBtn} onPress={handleDelete}>
              <Text style={styles.deleteBtnText}>SUPPRIMER</Text>
            </TouchableOpacity>
          </View>

          {/* Inline edit panel */}
          {isEditing && (
            <View style={styles.editPanel}>
              <View style={styles.editPanelHeader}>
                <Text style={styles.editPanelTitle}>
                  MODIFICATION RAPIDE
                </Text>
                <TouchableOpacity onPress={closeInlineEdit}>
                  <Ionicons name="close" size={18} color="#64748b" />
                </TouchableOpacity>
              </View>

              {/* Sub-types */}
              {(isLoadingSubTypes || subTypes.length > 0) && (
                <View style={styles.editField}>
                  <View style={styles.labelRow}>
                    <Ionicons
                      name="layers-outline"
                      size={12}
                      color="#94a3b8"
                    />
                    <Text style={styles.editFieldLabel}>TYPE DE CONTRAT</Text>
                    {isLoadingSubTypes && (
                      <ActivityIndicator size="small" color="#0ea5e9" />
                    )}
                  </View>
                  <View style={styles.chipRow}>
                    <TouchableOpacity
                      style={[
                        styles.chip,
                        editSubTypeCode === '' && styles.chipActiveSlate,
                      ]}
                      onPress={() => setEditSubTypeCode('')}
                    >
                      <Text
                        style={[
                          styles.chipText,
                          editSubTypeCode === '' && styles.chipTextActive,
                        ]}
                      >
                        Non précisé
                      </Text>
                    </TouchableOpacity>
                    {subTypes.map((sub) => (
                      <TouchableOpacity
                        key={sub.code}
                        style={[
                          styles.chip,
                          editSubTypeCode === sub.code &&
                            styles.chipActiveIndigo,
                        ]}
                        onPress={() =>
                          setEditSubTypeCode(
                            sub.code === editSubTypeCode ? '' : sub.code,
                          )
                        }
                      >
                        <Text
                          style={[
                            styles.chipText,
                            editSubTypeCode === sub.code &&
                              styles.chipTextActive,
                          ]}
                        >
                          {sub.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              )}

              {/* Formulas */}
              <View style={styles.editField}>
                <View style={styles.labelRow}>
                  <Text style={styles.editFieldLabel}>
                    FORMULE SOUSCRITE
                  </Text>
                  {isLoadingFormulas && (
                    <ActivityIndicator size="small" color="#0ea5e9" />
                  )}
                </View>
                {availableFormulas.length > 0 && (
                  <View style={styles.chipRow}>
                    {availableFormulas.map((f) => (
                      <TouchableOpacity
                        key={f}
                        style={[
                          styles.chip,
                          editFormula === f && styles.chipActivePrimary,
                        ]}
                        onPress={() => setEditFormula(f)}
                      >
                        <Text
                          style={[
                            styles.chipText,
                            editFormula === f && styles.chipTextActive,
                          ]}
                        >
                          {f}
                        </Text>
                      </TouchableOpacity>
                    ))}
                    <TouchableOpacity
                      style={styles.chipDashed}
                      onPress={() => setEditFormula('')}
                    >
                      <Text style={styles.chipTextMuted}>Autre</Text>
                    </TouchableOpacity>
                  </View>
                )}
                <TextInput
                  style={styles.editInput}
                  value={editFormula}
                  onChangeText={setEditFormula}
                  placeholder={
                    availableFormulas.length > 0
                      ? 'Ou saisir librement…'
                      : 'Ex : Formule Tout Risque'
                  }
                  placeholderTextColor="#94a3b8"
                />
              </View>

              {/* Options */}
              {(isLoadingOptions || availableOptions.length > 0) && (
                <View style={styles.editField}>
                  <View style={styles.labelRow}>
                    <Ionicons
                      name="settings-outline"
                      size={12}
                      color="#94a3b8"
                    />
                    <Text style={styles.editFieldLabel}>
                      OPTIONS SOUSCRITES
                    </Text>
                    {isLoadingOptions && (
                      <ActivityIndicator size="small" color="#0ea5e9" />
                    )}
                  </View>
                  {availableOptions.map((opt) => {
                    const isChecked = editOptions.includes(
                      opt.guarantee_label,
                    );
                    return (
                      <TouchableOpacity
                        key={opt.guarantee_key}
                        style={[
                          styles.optionToggle,
                          isChecked && styles.optionToggleChecked,
                        ]}
                        onPress={() =>
                          setEditOptions(
                            isChecked
                              ? editOptions.filter(
                                  (o) => o !== opt.guarantee_label,
                                )
                              : [...editOptions, opt.guarantee_label],
                          )
                        }
                      >
                        <Text
                          style={[
                            styles.optionToggleText,
                            isChecked && styles.optionToggleTextChecked,
                          ]}
                        >
                          {opt.guarantee_label}
                        </Text>
                        <View
                          style={[
                            styles.optionCheckbox,
                            isChecked && styles.optionCheckboxChecked,
                          ]}
                        >
                          {isChecked && (
                            <Ionicons
                              name="checkmark"
                              size={12}
                              color="#fff"
                            />
                          )}
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                  {availableOptions.length === 0 && !isLoadingOptions && (
                    <Text style={styles.noOptionsText}>
                      Aucune option disponible pour cette formule
                    </Text>
                  )}
                </View>
              )}

              {/* Summary */}
              <View style={styles.editField}>
                <Text style={styles.editFieldLabel}>
                  DESCRIPTION / RÉSUMÉ
                </Text>
                <TextInput
                  style={[styles.editInput, styles.editTextarea]}
                  value={editSummary}
                  onChangeText={setEditSummary}
                  placeholder="Description courte du contrat..."
                  placeholderTextColor="#94a3b8"
                  multiline
                  numberOfLines={3}
                />
              </View>

              {/* Save / Cancel */}
              <View style={styles.editActions}>
                <TouchableOpacity
                  style={styles.saveBtn}
                  onPress={saveInlineEdit}
                >
                  <Text style={styles.saveBtnText}>ENREGISTRER</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.cancelBtn}
                  onPress={closeInlineEdit}
                >
                  <Text style={styles.cancelBtnText}>ANNULER</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  /* Card */
  card: {
    backgroundColor: '#fff',
    borderRadius: 32,
    borderWidth: 1,
    borderColor: '#f1f5f9',
    marginHorizontal: 16,
    marginVertical: 6,
  },
  cardExpanded: {
    borderColor: '#38bdf8',
    shadowColor: '#0ea5e9',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 12,
  },
  /* Header */
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    gap: 14,
  },
  typeIcon: {
    width: 56,
    height: 56,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  headerMid: { flex: 1, gap: 4 },
  headerRight: { alignItems: 'flex-end', gap: 4 },
  name: { fontSize: 15, fontWeight: '800', color: '#0f172a' },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  insurer: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748b',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  subTypeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#eef2ff',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
  },
  subTypeBadgeText: {
    fontSize: 8,
    fontWeight: '800',
    color: '#4f46e5',
    textTransform: 'uppercase',
  },
  formulaBadge: {
    backgroundColor: '#f0f9ff',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
  },
  formulaBadgeText: {
    fontSize: 8,
    fontWeight: '800',
    color: '#0ea5e9',
    textTransform: 'uppercase',
  },
  /* Expanded */
  expandedContent: {
    paddingHorizontal: 24,
    paddingBottom: 24,
    gap: 16,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingTop: 16,
  },
  premiumBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#ecfdf5',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  premiumText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#059669',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  dateText: { fontSize: 10, color: '#94a3b8', fontWeight: '500' },
  /* Formula card */
  formulaCard: {
    backgroundColor: '#f0f9ff',
    borderWidth: 1,
    borderColor: '#bae6fd',
    borderRadius: 24,
    padding: 20,
    gap: 14,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  formulaLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#0369a1',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  subTypeValue: {
    fontSize: 14,
    fontWeight: '800',
    color: '#312e81',
    marginTop: 4,
  },
  formulaValue: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0c4a6e',
    marginTop: 6,
  },
  optionChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 6,
  },
  optionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#bae6fd',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  optionChipText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#0369a1',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  /* CG section */
  cgSection: { gap: 8 },
  cgLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#94a3b8',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  cgLink: {
    backgroundColor: '#0f172a',
    borderRadius: 16,
    padding: 16,
  },
  cgLinkContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  cgLinkTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  cgLinkHost: {
    fontSize: 9,
    color: '#94a3b8',
    marginTop: 2,
  },
  cgSearchBtn: {
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: '#e2e8f0',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    gap: 8,
  },
  cgSearchText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#94a3b8',
    textAlign: 'center',
  },
  /* Summary */
  summaryBox: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#f1f5f9',
    marginTop: 6,
  },
  summaryText: {
    fontSize: 13,
    color: '#475569',
    lineHeight: 20,
  },
  /* Actions */
  coverageBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#0ea5e9',
    paddingVertical: 14,
    borderRadius: 16,
  },
  coverageBtnText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: 1.5,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 8,
  },
  editBtn: {
    flex: 1,
    paddingVertical: 14,
    backgroundColor: '#f0f9ff',
    borderRadius: 16,
    alignItems: 'center',
  },
  editBtnText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#0ea5e9',
    letterSpacing: 1.5,
  },
  deleteBtn: {
    flex: 1,
    paddingVertical: 14,
    backgroundColor: '#fff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#fecaca',
    alignItems: 'center',
  },
  deleteBtnText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#ef4444',
    letterSpacing: 1.5,
  },
  /* Inline edit panel */
  editPanel: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 24,
    padding: 20,
    gap: 14,
  },
  editPanelHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  editPanelTitle: {
    fontSize: 10,
    fontWeight: '800',
    color: '#334155',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  editField: { gap: 8 },
  editFieldLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: '#94a3b8',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#e2e8f0',
    backgroundColor: '#fff',
  },
  chipActiveSlate: {
    backgroundColor: '#334155',
    borderColor: '#334155',
  },
  chipActiveIndigo: {
    backgroundColor: '#4f46e5',
    borderColor: '#4f46e5',
  },
  chipActivePrimary: {
    backgroundColor: '#0ea5e9',
    borderColor: '#0ea5e9',
  },
  chipDashed: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: '#e2e8f0',
  },
  chipText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#475569',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  chipTextActive: {
    color: '#fff',
  },
  chipTextMuted: {
    fontSize: 10,
    fontWeight: '800',
    color: '#94a3b8',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  editInput: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 14,
    fontWeight: '500',
    color: '#0f172a',
  },
  editTextarea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  /* Option toggles */
  optionToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#f1f5f9',
    backgroundColor: '#fff',
  },
  optionToggleChecked: {
    backgroundColor: '#ecfdf5',
    borderColor: '#34d399',
  },
  optionToggleText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#475569',
    flex: 1,
  },
  optionToggleTextChecked: {
    color: '#064e3b',
  },
  optionCheckbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#e2e8f0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionCheckboxChecked: {
    backgroundColor: '#22c55e',
    borderColor: '#22c55e',
  },
  noOptionsText: {
    fontSize: 9,
    color: '#94a3b8',
    fontWeight: '500',
  },
  /* Edit actions */
  editActions: {
    flexDirection: 'row',
    gap: 8,
  },
  saveBtn: {
    flex: 1,
    paddingVertical: 14,
    backgroundColor: '#0ea5e9',
    borderRadius: 16,
    alignItems: 'center',
  },
  saveBtnText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: 1.5,
  },
  cancelBtn: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 16,
    alignItems: 'center',
  },
  cancelBtnText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#475569',
    letterSpacing: 1.5,
  },
});
