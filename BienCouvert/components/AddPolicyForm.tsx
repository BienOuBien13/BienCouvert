// components/AddPolicyForm.tsx — Formulaire d'ajout de police adapté RN
// Adapté depuis FrontEnd/components/PolicyForm.tsx

import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Input } from './ui/Input';
import { Button } from './ui/Button';
import { Policy, PolicyType, User } from '../types';
import { uuid } from '../utils/uuid';
import { useInsurers } from '../hooks/useMasterData';

interface Props {
  user: User;
  editingPolicy?: Policy | null;
  onSave: (policy: Policy) => Promise<void>;
  onCancel: () => void;
}

// Catégories avec icônes Ionicons et couleurs — identiques aux cartes du web
const CATEGORIES: { type: PolicyType; label: string; icon: keyof typeof Ionicons.glyphMap; bg: string; color: string; description: string }[] = [
  { type: PolicyType.AUTO,      label: 'Automobile',    icon: 'car-outline',          bg: '#eff6ff', color: '#2563eb', description: 'Voiture, moto' },
  { type: PolicyType.HOME,      label: 'Habitation',    icon: 'home-outline',         bg: '#fff7ed', color: '#ea580c', description: 'Appartement, maison' },
  { type: PolicyType.HEALTH,    label: 'Santé',         icon: 'heart-outline',        bg: '#f0fdf4', color: '#16a34a', description: 'Mutuelle, prévoyance' },
  { type: PolicyType.BANK_CARD, label: 'Carte Bancaire',icon: 'card-outline',         bg: '#eef2ff', color: '#4f46e5', description: 'VISA, Mastercard' },
  { type: PolicyType.MOBILE,    label: 'Appareils',     icon: 'phone-portrait-outline',bg: '#f8fafc', color: '#475569', description: 'Smartphone, tablette' },
  { type: PolicyType.LEGAL,     label: 'Juridique',     icon: 'scale-outline',        bg: '#faf5ff', color: '#7c3aed', description: 'Protection juridique' },
  { type: PolicyType.LOAN,      label: 'Emprunteur',    icon: 'cash-outline',         bg: '#fffbeb', color: '#d97706', description: 'Crédit immo' },
  { type: PolicyType.OTHER,     label: 'Autre',         icon: 'shield-outline',       bg: '#f8fafc', color: '#94a3b8', description: 'Assurance diverse' },
];

const MAJOR_INSURERS = ['AXA', 'MAIF', 'MACIF', 'Allianz', 'Matmut', 'GMF', 'Generali', 'Direct Assur.'];

export function AddPolicyForm({ user, editingPolicy, onSave, onCancel }: Props) {
  // Step 1 = selector, Step 2 = form details
  const [step, setStep] = useState<'selector' | 'input'>(editingPolicy ? 'input' : 'selector');
  const [type, setType] = useState<PolicyType>(editingPolicy?.type || PolicyType.HOME);

  const [name, setName] = useState(editingPolicy?.name || '');
  const [insurer, setInsurer] = useState(editingPolicy?.insurer || '');
  const [formula, setFormula] = useState(editingPolicy?.formula || '');
  const [premium, setPremium] = useState(editingPolicy?.annualPremium?.toString() || '');
  const [summary, setSummary] = useState(editingPolicy?.summary || '');
  const [isSaving, setIsSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const { insurers: insurerList } = useInsurers();

  const selectedCategory = CATEGORIES.find(c => c.type === type);

  const handleSelectType = (catType: PolicyType) => {
    setType(catType);
    setStep('input');
  };

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};
    if (!name.trim()) newErrors.name = 'Le nom est requis.';
    if (!insurer.trim()) newErrors.insurer = "L'assureur est requis.";
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setIsSaving(true);
    try {
      const policy: Policy = {
        id: editingPolicy?.id || uuid(),
        userId: user.id,
        name: name.trim(),
        insurer: insurer.trim(),
        type,
        formula: formula.trim() || undefined,
        coverageDetail: formula.trim() || undefined,
        summary: summary.trim() || undefined,
        annualPremium: premium ? parseFloat(premium) : undefined,
        fileData: editingPolicy?.fileData || null,
        fileName: editingPolicy?.fileName || null,
        mimeType: editingPolicy?.mimeType || 'application/octet-stream',
        addedAt: editingPolicy?.addedAt || Date.now(),
      };
      await onSave(policy);
    } catch (e: any) {
      Alert.alert('Erreur', e.message || 'Impossible de sauvegarder.');
    } finally {
      setIsSaving(false);
    }
  };

  // ── Step 1 : Selector ────────────────────────────────────────────────────
  if (step === 'selector') {
    return (
      <View style={styles.flex}>
        <View style={styles.titleRow}>
          <TouchableOpacity onPress={onCancel} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={22} color="#0f172a" />
          </TouchableOpacity>
          <View>
            <Text style={styles.title}>Nouveau contrat</Text>
            <Text style={styles.stepHint}>Étape 1 / 2 — Choisir le type d'assurance</Text>
          </View>
        </View>
        <ScrollView contentContainerStyle={styles.selectorGrid} showsVerticalScrollIndicator={false}>
          {CATEGORIES.map(cat => (
            <TouchableOpacity
              key={cat.type}
              style={[styles.categoryCard, { backgroundColor: cat.bg, borderColor: cat.color + '40' }]}
              onPress={() => handleSelectType(cat.type)}
              activeOpacity={0.75}
            >
              <View style={[styles.categoryIcon, { backgroundColor: cat.color + '1a' }]}>
                <Ionicons name={cat.icon} size={28} color={cat.color} />
              </View>
              <Text style={[styles.categoryLabel, { color: cat.color }]}>{cat.label}</Text>
              <Text style={styles.categoryDesc}>{cat.description}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
    );
  }

  // ── Step 2 : Details form ────────────────────────────────────────────────
  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.titleRow}>
          <TouchableOpacity onPress={() => editingPolicy ? onCancel() : setStep('selector')} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={22} color="#0f172a" />
          </TouchableOpacity>
          <View style={styles.flex}>
            <Text style={styles.title}>{editingPolicy ? 'Modifier le contrat' : 'Détails du contrat'}</Text>
            {!editingPolicy && <Text style={styles.stepHint}>Étape 2 / 2 — Informations du contrat</Text>}
          </View>
        </View>

        {/* Type badge recap */}
        {selectedCategory && (
          <TouchableOpacity
            style={[styles.typeBadge, { backgroundColor: selectedCategory.bg, borderColor: selectedCategory.color + '50' }]}
            onPress={() => !editingPolicy && setStep('selector')}
          >
            <Ionicons name={selectedCategory.icon} size={18} color={selectedCategory.color} />
            <Text style={[styles.typeBadgeText, { color: selectedCategory.color }]}>{selectedCategory.label}</Text>
            {!editingPolicy && <Ionicons name="chevron-down" size={14} color={selectedCategory.color} />}
          </TouchableOpacity>
        )}

        <View style={styles.form}>
          <Input
            label="Nom du contrat *"
            value={name}
            onChangeText={setName}
            placeholder="Ex: Assurance auto Peugeot 208"
            error={errors.name}
          />

          {/* Assureur */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Assureur *</Text>
            <Input
              value={insurer}
              onChangeText={setInsurer}
              placeholder="Ex: MAIF, AXA, Allianz…"
              error={errors.insurer}
            />
            {/* Quick-pick insurer chips */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chips}>
              {(insurerList.length > 0 ? insurerList.slice(0, 10).map(i => i.label) : MAJOR_INSURERS).map(name_ => (
                <TouchableOpacity
                  key={name_}
                  onPress={() => setInsurer(name_)}
                  style={[styles.chip, insurer === name_ && styles.chipSelected]}
                >
                  <Text style={[styles.chipText, insurer === name_ && styles.chipTextSelected]}>
                    {name_}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          <Input
            label="Formule souscrite"
            value={formula}
            onChangeText={setFormula}
            placeholder="Ex: Tous Risques, Plénitude…"
          />

          <Input
            label="Cotisation annuelle (€)"
            value={premium}
            onChangeText={setPremium}
            keyboardType="decimal-pad"
            placeholder="Ex: 450"
          />

          <Input
            label="Résumé / Notes"
            value={summary}
            onChangeText={setSummary}
            placeholder="Informations importantes sur ce contrat…"
            multiline
            numberOfLines={4}
            style={styles.textArea}
          />

          <View style={styles.btnRow}>
            <Button label="Annuler" variant="ghost" onPress={onCancel} style={styles.flex} />
            <Button
              label={editingPolicy ? 'Enregistrer' : 'Ajouter le contrat'}
              onPress={handleSave}
              loading={isSaving}
              style={styles.flex}
            />
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { padding: 16, paddingBottom: 40, backgroundColor: '#f8fafc' },
  titleRow: { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 12 },
  backBtn: { padding: 4 },
  title: { fontSize: 20, fontWeight: '800', color: '#0f172a' },
  stepHint: { fontSize: 12, color: '#64748b', marginTop: 2 },
  // Selector step
  selectorGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 12,
    paddingBottom: 32,
    gap: 12,
  },
  categoryCard: {
    width: '46%',
    borderRadius: 16,
    padding: 16,
    alignItems: 'flex-start',
    gap: 8,
    borderWidth: 1,
  },
  categoryIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryLabel: { fontSize: 14, fontWeight: '800' },
  categoryDesc: { fontSize: 11, color: '#64748b' },
  // Input step
  typeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  typeBadgeText: { fontSize: 14, fontWeight: '700', flex: 1 },
  form: { paddingHorizontal: 16, gap: 16 },
  fieldGroup: { gap: 6 },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: '#475569' },
  chips: { marginTop: 8 },
  chip: {
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#f1f5f9',
    marginRight: 6,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  chipSelected: { backgroundColor: '#0ea5e9', borderColor: '#0ea5e9' },
  chipText: { fontSize: 12, color: '#475569', fontWeight: '600' },
  chipTextSelected: { color: '#fff' },
  textArea: { height: 100, textAlignVertical: 'top', paddingTop: 10 },
  btnRow: { flexDirection: 'row', gap: 12, marginTop: 8 },
});
