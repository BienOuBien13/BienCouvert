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
import { useInsuranceTypes, useInsurers } from '../hooks/useMasterData';

interface Props {
  user: User;
  editingPolicy?: Policy | null;
  onSave: (policy: Policy) => Promise<void>;
  onCancel: () => void;
}

export function AddPolicyForm({ user, editingPolicy, onSave, onCancel }: Props) {
  const [name, setName] = useState(editingPolicy?.name || '');
  const [insurer, setInsurer] = useState(editingPolicy?.insurer || '');
  const [type, setType] = useState<PolicyType>(editingPolicy?.type || PolicyType.HOME);
  const [formula, setFormula] = useState(editingPolicy?.formula || '');
  const [premium, setPremium] = useState(editingPolicy?.annualPremium?.toString() || '');
  const [summary, setSummary] = useState(editingPolicy?.summary || '');
  const [isSaving, setIsSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const { types: insuranceTypes } = useInsuranceTypes();
  const { insurers: insurerList } = useInsurers();

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

  const policyTypes = Object.values(PolicyType);

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.titleRow}>
          <TouchableOpacity onPress={onCancel} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={22} color="#0f172a" />
          </TouchableOpacity>
          <Text style={styles.title}>
            {editingPolicy ? 'Modifier le contrat' : 'Nouveau contrat'}
          </Text>
        </View>

        <View style={styles.form}>
          <Input
            label="Nom du contrat *"
            value={name}
            onChangeText={setName}
            placeholder="Ex: Assurance auto Peugeot 208"
            error={errors.name}
          />

          {/* Sélecteur d'assureur */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Assureur *</Text>
            <Input
              value={insurer}
              onChangeText={setInsurer}
              placeholder="Ex: MAIF, AXA, Allianz…"
              error={errors.insurer}
            />
            {insurerList.length > 0 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chips}>
                {insurerList.slice(0, 10).map(i => (
                  <TouchableOpacity
                    key={i.code}
                    onPress={() => setInsurer(i.label)}
                    style={[styles.chip, insurer === i.label && styles.chipSelected]}
                  >
                    <Text style={[styles.chipText, insurer === i.label && styles.chipTextSelected]}>
                      {i.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
          </View>

          {/* Sélecteur de type */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Type d'assurance *</Text>
            <View style={styles.typeGrid}>
              {policyTypes.map(pt => (
                <TouchableOpacity
                  key={pt}
                  onPress={() => setType(pt)}
                  style={[styles.typeBtn, type === pt && styles.typeBtnSelected]}
                >
                  <Text style={[styles.typeBtnText, type === pt && styles.typeBtnTextSelected]}>
                    {pt}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
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
              label={editingPolicy ? 'Enregistrer' : 'Ajouter'}
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
  titleRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 24, gap: 12 },
  backBtn: { padding: 4 },
  title: { fontSize: 20, fontWeight: '800', color: '#0f172a' },
  form: { gap: 16 },
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
  typeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  typeBtn: {
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  typeBtnSelected: { backgroundColor: '#0ea5e9', borderColor: '#0ea5e9' },
  typeBtnText: { fontSize: 12, color: '#475569', fontWeight: '600' },
  typeBtnTextSelected: { color: '#fff' },
  textArea: { height: 100, textAlignVertical: 'top', paddingTop: 10 },
  btnRow: { flexDirection: 'row', gap: 12, marginTop: 8 },
});
