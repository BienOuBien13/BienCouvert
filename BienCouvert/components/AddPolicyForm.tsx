// components/AddPolicyForm.tsx — Formulaire d'ajout de police
// Exact rebuild from FrontEnd/components/PolicyForm.tsx
// 3 views: selector → input (smart/web) → refining

import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Alert,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Input } from './ui/Input';
import { Button } from './ui/Button';
import { Policy, PolicyType, User } from '../types';
import { uuid } from '../utils/uuid';
import { useInsurers } from '../hooks/useMasterData';
import { parsePoliciesFromText, searchPolicyInfo } from '../services/geminiService';
import { storageService } from '../services/storageService';
import { apiFetch } from '../services/api';
import {
  getInsuranceSubTypes,
  type InsuranceSubType,
} from '../services/masterDataService';

// Mapping PolicyType → code API
const POLICY_TYPE_TO_CODE: Partial<Record<PolicyType, string>> = {
  [PolicyType.AUTO]: 'AUT01',
  [PolicyType.HOME]: 'HAB01',
  [PolicyType.HEALTH]: 'SAN01',
  [PolicyType.LIFE]: 'PRE01',
};

interface Props {
  user: User;
  editingPolicy?: Policy | null;
  onSave: (policy: Policy) => Promise<void>;
  onCancel: () => void;
}

type FormView = 'selector' | 'input' | 'refining';
type InputMode = 'smart' | 'web';

// Categories matching web GUIDE_CATEGORIES exactly
const CATEGORIES: {
  type: PolicyType;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  bg: string;
  color: string;
  description: string;
}[] = [
  { type: PolicyType.AUTO, label: 'Automobile', icon: 'car-outline', bg: '#eff6ff', color: '#2563eb', description: 'Voiture, moto' },
  { type: PolicyType.HOME, label: 'Habitation', icon: 'home-outline', bg: '#fff7ed', color: '#ea580c', description: 'Appartement, maison' },
  { type: PolicyType.HEALTH, label: 'Santé', icon: 'heart-outline', bg: '#f0fdf4', color: '#16a34a', description: 'Mutuelle, prévoyance' },
  { type: PolicyType.BANK_CARD, label: 'Carte Bancaire', icon: 'card-outline', bg: '#eef2ff', color: '#4f46e5', description: 'VISA, Mastercard' },
  { type: PolicyType.MOBILE, label: 'Appareils', icon: 'phone-portrait-outline', bg: '#f8fafc', color: '#475569', description: 'Smartphone, tablette' },
  { type: PolicyType.LEGAL, label: 'Juridique', icon: 'scale-outline', bg: '#faf5ff', color: '#7c3aed', description: 'Protection juridique' },
  { type: PolicyType.LOAN, label: 'Emprunteur', icon: 'cash-outline', bg: '#fffbeb', color: '#d97706', description: 'Crédit immo' },
  { type: PolicyType.OTHER, label: 'Autre', icon: 'shield-outline', bg: '#f8fafc', color: '#94a3b8', description: 'Assurance diverse' },
];

const MAJOR_INSURERS_CHIPS = [
  { name: 'AXA', abbrev: 'AX' },
  { name: 'MAIF', abbrev: 'MA' },
  { name: 'MACIF', abbrev: 'MC' },
  { name: 'Allianz', abbrev: 'AL' },
  { name: 'Matmut', abbrev: 'MT' },
  { name: 'GMF', abbrev: 'GM' },
  { name: 'Generali', abbrev: 'GE' },
  { name: 'Direct Assur.', abbrev: 'DA' },
];

export function AddPolicyForm({ user, editingPolicy, onSave, onCancel }: Props) {
  const [formView, setFormView] = useState<FormView>(editingPolicy ? 'input' : 'selector');
  const [mode, setMode] = useState<InputMode>('smart');
  const [type, setType] = useState<PolicyType>(editingPolicy?.type || PolicyType.AUTO);

  // Manual mode fields
  const [name, setName] = useState(editingPolicy?.name || '');
  const [insurer, setInsurer] = useState(editingPolicy?.insurer || '');

  // Smart mode (chatbot)
  const [chatMessages, setChatMessages] = useState<Array<{ role: 'user' | 'assistant'; text: string }>>([]);
  const [smartText, setSmartText] = useState('');
  const [isWaitingResponse, setIsWaitingResponse] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  // Refining state
  const [refiningPolicy, setRefiningPolicy] = useState<
    Partial<Policy> & {
      isSearchingPDF: boolean;
      suggestedFormulas?: string[];
      suggestedOptions?: string[];
    }
  | null>(null);
  const [refiningSubTypeCode, setRefiningSubTypeCode] = useState('');
  const [availableSubTypes, setAvailableSubTypes] = useState<InsuranceSubType[]>([]);
  const [isLoadingSubTypes, setIsLoadingSubTypes] = useState(false);

  const { insurers: insurerList } = useInsurers();

  useEffect(() => {
    if (editingPolicy) {
      setFormView('input');
      setMode('web');
      setName(editingPolicy.name);
      setInsurer(editingPolicy.insurer);
      setType(editingPolicy.type);
    }
  }, [editingPolicy]);

  // Initialize chatbot when entering smart mode
  useEffect(() => {
    if (mode === 'smart' && formView === 'input' && chatMessages.length === 0) {
      const categoryName = CATEGORIES.find((c) => c.type === type)?.label || 'assurance';
      setChatMessages([
        {
          role: 'assistant',
          text: `Bonjour ! 👋 Je vais vous aider à enregistrer votre ${categoryName.toLowerCase()}. Pour commencer, chez quel assureur êtes-vous ?`,
        },
      ]);
    }
  }, [mode, formView]);

  const selectCategory = (catType: PolicyType) => {
    setType(catType);
    setFormView('input');
  };

  const resetForm = () => {
    setName('');
    setInsurer('');
    setType(PolicyType.AUTO);
    setSmartText('');
    setChatMessages([]);
    setIsWaitingResponse(false);
    setRefiningPolicy(null);
    setRefiningSubTypeCode('');
    setAvailableSubTypes([]);
    setMode('smart');
    setFormView('selector');
  };

  const startRefining = async (extracted: Partial<Policy>) => {
    setFormView('refining');
    setRefiningSubTypeCode('');
    const temp: any = { ...extracted, isSearchingPDF: true };
    setRefiningPolicy(temp);

    // Load sub-types
    const parentCode = POLICY_TYPE_TO_CODE[extracted.type as PolicyType];
    if (parentCode) {
      setIsLoadingSubTypes(true);
      getInsuranceSubTypes(parentCode)
        .then((subs) => setAvailableSubTypes(subs))
        .finally(() => setIsLoadingSubTypes(false));
    } else {
      setAvailableSubTypes([]);
    }

    try {
      // Search policy info via AI
      const info = await searchPolicyInfo(
        extracted.name || 'Contrat',
        extracted.insurer || '',
      );
      // Also try to get formulas from CG central
      const insurerCode = (extracted as any).insurerCode;
      const typeCode = (extracted as any).typeCode;
      let formulas: string[] = [];
      if (insurerCode && typeCode) {
        try {
          const cgData = await apiFetch<{ formules?: string[] }>(
            `/cg/central/by-type-and-insurer?insurance_type_code=${encodeURIComponent(typeCode)}&insurer_code=${encodeURIComponent(insurerCode)}`,
          );
          if (cgData?.formules?.length) formulas = cgData.formules;
        } catch {}
      }

      setRefiningPolicy({
        ...temp,
        sourceUrl: info.sourceUrl,
        summary: info.summary,
        suggestedFormulas: formulas.length > 0 ? formulas : (temp.suggestedFormulas || []),
        suggestedOptions: temp.suggestedOptions || [],
        isSearchingPDF: false,
      });
    } catch {
      setRefiningPolicy({
        ...temp,
        isSearchingPDF: false,
        suggestedFormulas: temp.suggestedFormulas || [],
        suggestedOptions: temp.suggestedOptions || [],
      });
    }
  };

  const handleChatMessage = async (userMessage: string) => {
    if (!userMessage.trim() || isWaitingResponse) return;
    const newMessages = [
      ...chatMessages,
      { role: 'user' as const, text: userMessage },
    ];
    setChatMessages(newMessages);
    setSmartText('');
    setIsWaitingResponse(true);

    try {
      const result = await parsePoliciesFromText(userMessage);

      if (result.policies.length > 0 && result.policies[0].insurer) {
        // Enough info to go to refining
        startRefining(result.policies[0]);
      } else {
        // Ask follow-up
        const nextQuestion =
          result.clarificationQuestions ||
          'Chez quel assureur avez-vous souscrit ce contrat ?';
        setChatMessages([
          ...newMessages,
          { role: 'assistant', text: nextQuestion },
        ]);
      }
    } catch {
      setChatMessages([
        ...newMessages,
        {
          role: 'assistant',
          text: "Désolé, j'ai rencontré une erreur. Pouvez-vous reformuler ?",
        },
      ]);
    } finally {
      setIsWaitingResponse(false);
    }
  };

  const handleManualNext = () => {
    if (!insurer || !name) return;
    startRefining({ insurer, name, type });
  };

  const finalizeSave = async () => {
    if (!refiningPolicy) return;
    try {
      const policy: Policy = {
        id: editingPolicy?.id || uuid(),
        userId: user.id,
        name: refiningPolicy.name || name || 'Sans nom',
        insurer: refiningPolicy.insurer || insurer,
        type: refiningPolicy.type || type,
        formula: refiningPolicy.coverageDetail || undefined,
        coverageDetail: refiningPolicy.coverageDetail || undefined,
        options: refiningPolicy.options || [],
        summary: refiningPolicy.summary || 'Vérifié par BienCouvert.',
        sourceUrl: refiningPolicy.sourceUrl,
        subTypeCode: refiningSubTypeCode || undefined,
        subTypeLabel: availableSubTypes.find(
          (s) => s.code === refiningSubTypeCode,
        )?.label,
        addedAt: editingPolicy?.addedAt || Date.now(),
        fileData: editingPolicy?.fileData || null,
        fileName: editingPolicy?.fileName || null,
        mimeType: editingPolicy?.mimeType || 'text/plain',
      };
      await onSave(policy);
      resetForm();
    } catch (e: any) {
      Alert.alert('Erreur', e.message || 'Impossible de sauvegarder.');
    }
  };

  /* ──────── View 1: Category Selector ──────── */
  if (formView === 'selector') {
    return (
      <View style={styles.flex}>
        <View style={styles.titleRow}>
          <TouchableOpacity onPress={onCancel} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={22} color="#0f172a" />
          </TouchableOpacity>
          <View style={styles.flex}>
            <Text style={styles.title}>Admission Express</Text>
            <Text style={styles.stepHint}>Étape 1 : Choisir le type d'assurance</Text>
          </View>
        </View>
        <ScrollView
          contentContainerStyle={styles.selectorGrid}
          showsVerticalScrollIndicator={false}
        >
          {CATEGORIES.map((cat) => (
            <TouchableOpacity
              key={cat.type}
              style={[
                styles.categoryCard,
                { backgroundColor: cat.bg, borderColor: cat.color + '40' },
              ]}
              onPress={() => selectCategory(cat.type)}
              activeOpacity={0.75}
            >
              <Ionicons name={cat.icon} size={32} color={cat.color} />
              <Text style={[styles.categoryLabel, { color: cat.color }]}>
                {cat.label}
              </Text>
            </TouchableOpacity>
          ))}
          {/* Free entry / AI assistant */}
          <TouchableOpacity
            style={styles.freeEntryBtn}
            onPress={() => {
              setType(PolicyType.OTHER);
              setFormView('input');
              setMode('smart');
            }}
          >
            <Ionicons name="flash" size={16} color="#fbbf24" />
            <Text style={styles.freeEntryText}>Saisie Libre / Assistant IA</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    );
  }

  /* ──────── View 3: Refining ──────── */
  if (formView === 'refining') {
    const catIcon = CATEGORIES.find((c) => c.type === (refiningPolicy?.type || type));

    return (
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled"
        >
          {/* Header */}
          <View style={styles.titleRow}>
            <TouchableOpacity
              onPress={() => setFormView('input')}
              style={styles.backBtn}
            >
              <Ionicons name="arrow-back" size={22} color="#64748b" />
            </TouchableOpacity>
            <Text style={styles.backText}>Retour</Text>
          </View>

          <View style={styles.refiningCard}>
            {/* Policy identity */}
            <View style={styles.refiningHeader}>
              <View style={styles.refiningIcon}>
                {catIcon && (
                  <Ionicons
                    name={catIcon.icon}
                    size={28}
                    color="#fff"
                  />
                )}
              </View>
              <View style={styles.flex}>
                <Text style={styles.refiningName}>
                  {refiningPolicy?.name || name}
                </Text>
                <Text style={styles.refiningInsurer}>
                  {refiningPolicy?.insurer || insurer}
                </Text>
              </View>
            </View>

            {refiningPolicy?.isSearchingPDF ? (
              <View style={styles.searchingBox}>
                <ActivityIndicator size="large" color="#0ea5e9" />
                <Text style={styles.searchingText}>
                  L'IA parcourt le catalogue de{' '}
                  {refiningPolicy.insurer}...
                </Text>
              </View>
            ) : (
              <View style={styles.refiningContent}>
                {/* Sub-types */}
                {(isLoadingSubTypes || availableSubTypes.length > 0) && (
                  <View style={styles.refiningField}>
                    <View style={styles.labelRow}>
                      <Ionicons
                        name="layers-outline"
                        size={12}
                        color="#6366f1"
                      />
                      <Text style={styles.refiningLabel}>
                        DE QUEL TYPE S'AGIT-IL ?
                      </Text>
                      {isLoadingSubTypes && (
                        <ActivityIndicator size="small" color="#0ea5e9" />
                      )}
                    </View>
                    <View style={styles.pillRow}>
                      {availableSubTypes.map((sub) => (
                        <TouchableOpacity
                          key={sub.code}
                          style={[
                            styles.pill,
                            refiningSubTypeCode === sub.code &&
                              styles.pillActiveIndigo,
                          ]}
                          onPress={() =>
                            setRefiningSubTypeCode(
                              sub.code === refiningSubTypeCode
                                ? ''
                                : sub.code,
                            )
                          }
                        >
                          <Text
                            style={[
                              styles.pillText,
                              refiningSubTypeCode === sub.code &&
                                styles.pillTextActive,
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
                {refiningPolicy?.suggestedFormulas &&
                  refiningPolicy.suggestedFormulas.length > 0 && (
                    <View style={styles.refiningField}>
                      <View style={styles.labelRow}>
                        <Ionicons
                          name="flash-outline"
                          size={12}
                          color="#f59e0b"
                        />
                        <Text style={styles.refiningLabel}>
                          QUELLE EST VOTRE FORMULE ?
                        </Text>
                      </View>
                      <View style={styles.pillRow}>
                        {refiningPolicy.suggestedFormulas.map((f) => (
                          <TouchableOpacity
                            key={f}
                            style={[
                              styles.pill,
                              refiningPolicy.coverageDetail === f &&
                                styles.pillActivePrimary,
                            ]}
                            onPress={() =>
                              setRefiningPolicy({
                                ...refiningPolicy,
                                coverageDetail: f,
                              })
                            }
                          >
                            <Text
                              style={[
                                styles.pillText,
                                refiningPolicy.coverageDetail === f &&
                                  styles.pillTextActive,
                              ]}
                            >
                              {f}
                            </Text>
                          </TouchableOpacity>
                        ))}
                        <TouchableOpacity
                          style={styles.pillDashed}
                          onPress={() => {
                            if (Platform.OS === 'ios' && Alert.prompt) {
                              Alert.prompt(
                                'Formule',
                                'Entrez votre formule :',
                                (val) => {
                                  if (val)
                                    setRefiningPolicy({
                                      ...refiningPolicy,
                                      coverageDetail: val,
                                    });
                                },
                              );
                            } else {
                              setRefiningPolicy({
                                ...refiningPolicy,
                                coverageDetail: '',
                              });
                            }
                          }}
                        >
                          <Text style={styles.pillTextMuted}>Autre +</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  )}

                {/* Options */}
                {refiningPolicy?.suggestedOptions &&
                  refiningPolicy.suggestedOptions.length > 0 && (
                    <View style={styles.refiningField}>
                      <View style={styles.labelRow}>
                        <Ionicons
                          name="checkmark-circle-outline"
                          size={12}
                          color="#22c55e"
                        />
                        <Text style={styles.refiningLabel}>
                          OPTIONS SOUSCRITES ?
                        </Text>
                      </View>
                      {refiningPolicy.suggestedOptions.map((opt) => {
                        const isSelected =
                          refiningPolicy.options?.includes(opt);
                        return (
                          <TouchableOpacity
                            key={opt}
                            style={[
                              styles.optionRow,
                              isSelected && styles.optionRowSelected,
                            ]}
                            onPress={() => {
                              const cur = refiningPolicy.options || [];
                              setRefiningPolicy({
                                ...refiningPolicy,
                                options: isSelected
                                  ? cur.filter((o) => o !== opt)
                                  : [...cur, opt],
                              });
                            }}
                          >
                            <Text
                              style={[
                                styles.optionRowText,
                                isSelected && styles.optionRowTextSelected,
                              ]}
                            >
                              {opt}
                            </Text>
                            <View
                              style={[
                                styles.optionCheck,
                                isSelected && styles.optionCheckSelected,
                              ]}
                            >
                              {isSelected && (
                                <Ionicons
                                  name="checkmark"
                                  size={14}
                                  color="#fff"
                                />
                              )}
                            </View>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  )}

                {/* AI Summary */}
                {refiningPolicy?.summary && (
                  <View style={styles.summaryCard}>
                    <Ionicons
                      name="information-circle-outline"
                      size={18}
                      color="#0ea5e9"
                    />
                    <Text style={styles.summaryCardText}>
                      "{refiningPolicy.summary}"
                    </Text>
                  </View>
                )}

                {/* Save */}
                <TouchableOpacity
                  style={styles.finalizeBtn}
                  onPress={finalizeSave}
                >
                  <Text style={styles.finalizeBtnText}>
                    AJOUTER AU PORTEFEUILLE
                  </Text>
                  <Ionicons name="arrow-forward" size={18} color="#fff" />
                </TouchableOpacity>
              </View>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  /* ──────── View 2: Input (Smart / Web) ──────── */
  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <View style={styles.titleRow}>
          <TouchableOpacity
            onPress={() => (editingPolicy ? onCancel() : resetForm())}
            style={styles.backBtn}
          >
            <Ionicons name="arrow-back" size={22} color="#0f172a" />
          </TouchableOpacity>
          <View style={styles.flex}>
            <View style={styles.typeIndicator}>
              {CATEGORIES.find((c) => c.type === type) && (
                <Ionicons
                  name={CATEGORIES.find((c) => c.type === type)!.icon}
                  size={14}
                  color="#0ea5e9"
                />
              )}
              <Text style={styles.typeIndicatorText}>{type}</Text>
            </View>
          </View>
        </View>

        <View style={styles.inputCard}>
          {/* Mode toggle: Scan IA / Saisie */}
          <View style={styles.modeToggle}>
            <TouchableOpacity
              style={[styles.modeBtn, mode === 'smart' && styles.modeBtnActive]}
              onPress={() => setMode('smart')}
            >
              <Text
                style={[
                  styles.modeBtnText,
                  mode === 'smart' && styles.modeBtnTextActive,
                ]}
              >
                Scan IA
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modeBtn, mode === 'web' && styles.modeBtnActive]}
              onPress={() => setMode('web')}
            >
              <Text
                style={[
                  styles.modeBtnText,
                  mode === 'web' && styles.modeBtnTextActive,
                ]}
              >
                Saisie
              </Text>
            </TouchableOpacity>
          </View>

          {mode === 'smart' ? (
            <View style={styles.chatSection}>
              {/* Chat messages */}
              <View style={styles.chatContainer}>
                {chatMessages.length === 0 && (
                  <View style={styles.chatEmpty}>
                    <Ionicons
                      name="sparkles"
                      size={36}
                      color="#bae6fd"
                    />
                    <Text style={styles.chatEmptyText}>
                      L'assistant IA va vous poser quelques questions pour
                      identifier votre contrat rapidement.
                    </Text>
                  </View>
                )}
                {chatMessages.map((msg, idx) => (
                  <View
                    key={idx}
                    style={[
                      styles.chatBubbleRow,
                      msg.role === 'user' && styles.chatBubbleRowUser,
                    ]}
                  >
                    <View
                      style={[
                        styles.chatBubble,
                        msg.role === 'user'
                          ? styles.chatBubbleUser
                          : styles.chatBubbleBot,
                      ]}
                    >
                      <Text
                        style={[
                          styles.chatBubbleText,
                          msg.role === 'user' && styles.chatBubbleTextUser,
                        ]}
                      >
                        {msg.text}
                      </Text>
                    </View>
                  </View>
                ))}
                {isWaitingResponse && (
                  <View style={styles.chatBubbleRow}>
                    <View style={[styles.chatBubble, styles.chatBubbleBot]}>
                      <ActivityIndicator size="small" color="#94a3b8" />
                    </View>
                  </View>
                )}
              </View>

              {/* Input row */}
              <View style={styles.chatInputRow}>
                <TextInput
                  style={styles.chatInput}
                  value={smartText}
                  onChangeText={setSmartText}
                  placeholder="Écrivez votre réponse..."
                  placeholderTextColor="#94a3b8"
                  editable={!isWaitingResponse}
                  onSubmitEditing={() => handleChatMessage(smartText)}
                  returnKeyType="send"
                />
                <TouchableOpacity
                  style={[
                    styles.chatSendBtn,
                    (!smartText.trim() || isWaitingResponse) &&
                      styles.chatSendBtnDisabled,
                  ]}
                  onPress={() => handleChatMessage(smartText)}
                  disabled={!smartText.trim() || isWaitingResponse}
                >
                  {isWaitingResponse ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Ionicons name="arrow-forward" size={18} color="#fff" />
                  )}
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            /* Web/Manual mode */
            <View style={styles.manualSection}>
              {/* Popular insurer chips — matching web */}
              <Text style={styles.chipSectionLabel}>ASSUREURS POPULAIRES</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.chipScroll}
              >
                {(insurerList.length > 0
                  ? insurerList.slice(0, 10).map((i) => ({
                      name: i.label,
                      abbrev: i.label.substring(0, 2).toUpperCase(),
                    }))
                  : MAJOR_INSURERS_CHIPS
                ).map((ins) => (
                  <TouchableOpacity
                    key={ins.name}
                    style={[
                      styles.insurerChip,
                      insurer === ins.name && styles.insurerChipSelected,
                    ]}
                    onPress={() => setInsurer(ins.name)}
                  >
                    <View style={styles.insurerAvatar}>
                      <Text style={styles.insurerAvatarText}>
                        {ins.abbrev}
                      </Text>
                    </View>
                    <Text style={styles.insurerChipText}>{ins.name}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <View style={styles.manualFields}>
                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>ASSUREUR</Text>
                  <TextInput
                    style={styles.manualInput}
                    value={insurer}
                    onChangeText={setInsurer}
                    placeholder="AXA, Maif, Allianz..."
                    placeholderTextColor="#94a3b8"
                  />
                </View>
                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>NOM DU CONTRAT</Text>
                  <TextInput
                    style={styles.manualInput}
                    value={name}
                    onChangeText={setName}
                    placeholder="N° police ou nom commercial..."
                    placeholderTextColor="#94a3b8"
                  />
                </View>
              </View>

              <TouchableOpacity
                style={[
                  styles.nextBtn,
                  (!insurer || !name) && styles.nextBtnDisabled,
                ]}
                onPress={handleManualNext}
                disabled={!insurer || !name}
              >
                <Text style={styles.nextBtnText}>SUIVANT</Text>
                <Ionicons name="arrow-forward" size={16} color="#fff" />
              </TouchableOpacity>
            </View>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { padding: 16, paddingBottom: 40, backgroundColor: '#f8fafc' },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 12,
  },
  backBtn: { padding: 4 },
  backText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#94a3b8',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  title: { fontSize: 22, fontWeight: '900', color: '#0f172a', letterSpacing: -0.5 },
  stepHint: { fontSize: 9, fontWeight: '800', color: '#0ea5e9', letterSpacing: 1.5, textTransform: 'uppercase', marginTop: 2 },
  /* Selector */
  selectorGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 32,
    gap: 12,
  },
  categoryCard: {
    width: '47%',
    borderRadius: 24,
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 2,
  },
  categoryLabel: {
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: -0.5,
  },
  freeEntryBtn: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    padding: 18,
    backgroundColor: '#0f172a',
    borderRadius: 24,
  },
  freeEntryText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#fff',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  /* Type indicator */
  typeIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  typeIndicatorText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#0ea5e9',
    textTransform: 'uppercase',
  },
  /* Input card */
  inputCard: {
    backgroundColor: '#fff',
    borderRadius: 32,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 20,
    gap: 16,
  },
  /* Mode toggle */
  modeToggle: {
    flexDirection: 'row',
    backgroundColor: '#f1f5f9',
    borderRadius: 16,
    padding: 4,
    alignSelf: 'center',
  },
  modeBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 12,
  },
  modeBtnActive: {
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  modeBtnText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#94a3b8',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  modeBtnTextActive: {
    color: '#0369a1',
  },
  /* Smart/Chat mode */
  chatSection: { gap: 12 },
  chatContainer: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 20,
    padding: 16,
    minHeight: 250,
    gap: 10,
  },
  chatEmpty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 32,
    gap: 12,
  },
  chatEmptyText: {
    fontSize: 12,
    color: '#94a3b8',
    fontWeight: '500',
    textAlign: 'center',
    maxWidth: 260,
  },
  chatBubbleRow: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
  },
  chatBubbleRowUser: {
    justifyContent: 'flex-end',
  },
  chatBubble: {
    maxWidth: '85%',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  chatBubbleUser: {
    backgroundColor: '#0ea5e9',
    borderBottomRightRadius: 4,
  },
  chatBubbleBot: {
    backgroundColor: '#fff',
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  chatBubbleText: {
    fontSize: 13,
    color: '#334155',
  },
  chatBubbleTextUser: {
    color: '#fff',
  },
  chatInputRow: {
    flexDirection: 'row',
    gap: 8,
  },
  chatInput: {
    flex: 1,
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: '#e2e8f0',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 14,
    fontWeight: '500',
    color: '#0f172a',
  },
  chatSendBtn: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: '#0ea5e9',
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chatSendBtnDisabled: {
    opacity: 0.5,
  },
  /* Manual mode */
  manualSection: { gap: 16 },
  chipSectionLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#94a3b8',
    letterSpacing: 1.5,
    marginLeft: 4,
  },
  chipScroll: { paddingBottom: 8 },
  insurerChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#f1f5f9',
    backgroundColor: '#fff',
    marginRight: 8,
  },
  insurerChipSelected: {
    borderColor: '#0ea5e9',
    backgroundColor: '#f0f9ff',
  },
  insurerAvatar: {
    width: 28,
    height: 28,
    borderRadius: 10,
    backgroundColor: '#334155',
    alignItems: 'center',
    justifyContent: 'center',
  },
  insurerAvatarText: {
    fontSize: 9,
    fontWeight: '900',
    color: '#fff',
  },
  insurerChipText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#334155',
  },
  manualFields: { gap: 14 },
  fieldGroup: { gap: 4 },
  fieldLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: '#94a3b8',
    letterSpacing: 1.5,
    marginLeft: 4,
  },
  manualInput: {
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: '#f1f5f9',
    borderRadius: 16,
    paddingHorizontal: 20,
    paddingVertical: 14,
    fontSize: 13,
    fontWeight: '700',
    color: '#0f172a',
  },
  nextBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 18,
    backgroundColor: '#0f172a',
    borderRadius: 24,
  },
  nextBtnDisabled: {
    opacity: 0.3,
  },
  nextBtnText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#fff',
    letterSpacing: 2,
  },
  /* Refining */
  refiningCard: {
    backgroundColor: '#fff',
    borderRadius: 32,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 24,
    gap: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 8,
  },
  refiningHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    paddingBottom: 20,
  },
  refiningIcon: {
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: '#0f172a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  refiningName: {
    fontSize: 20,
    fontWeight: '900',
    color: '#0f172a',
    letterSpacing: -0.5,
  },
  refiningInsurer: {
    fontSize: 10,
    fontWeight: '800',
    color: '#0ea5e9',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  searchingBox: {
    alignItems: 'center',
    gap: 16,
    paddingVertical: 40,
  },
  searchingText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#94a3b8',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    textAlign: 'center',
  },
  refiningContent: { gap: 24 },
  refiningField: { gap: 10 },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  refiningLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#94a3b8',
    letterSpacing: 1.5,
  },
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  pill: {
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#f1f5f9',
    backgroundColor: '#f8fafc',
  },
  pillActiveIndigo: {
    backgroundColor: '#4f46e5',
    borderColor: '#4f46e5',
  },
  pillActivePrimary: {
    backgroundColor: '#0ea5e9',
    borderColor: '#0ea5e9',
  },
  pillDashed: {
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 16,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: '#e2e8f0',
  },
  pillText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#64748b',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  pillTextActive: {
    color: '#fff',
  },
  pillTextMuted: {
    fontSize: 10,
    fontWeight: '800',
    color: '#94a3b8',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  /* Options */
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: '#f1f5f9',
    backgroundColor: '#fff',
  },
  optionRowSelected: {
    backgroundColor: '#ecfdf5',
    borderColor: '#22c55e',
  },
  optionRowText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
    flex: 1,
  },
  optionRowTextSelected: {
    color: '#064e3b',
  },
  optionCheck: {
    width: 24,
    height: 24,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#e2e8f0',
    backgroundColor: '#f8fafc',
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionCheckSelected: {
    backgroundColor: '#22c55e',
    borderColor: '#22c55e',
  },
  /* Summary */
  summaryCard: {
    flexDirection: 'row',
    gap: 12,
    padding: 18,
    backgroundColor: '#f0f9ff',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#bae6fd',
  },
  summaryCardText: {
    flex: 1,
    fontSize: 11,
    color: '#0c4a6e',
    fontWeight: '500',
    fontStyle: 'italic',
    lineHeight: 18,
  },
  /* Finalize */
  finalizeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 20,
    backgroundColor: '#0f172a',
    borderRadius: 24,
  },
  finalizeBtnText: {
    fontSize: 11,
    fontWeight: '900',
    color: '#fff',
    letterSpacing: 3,
  },
});
