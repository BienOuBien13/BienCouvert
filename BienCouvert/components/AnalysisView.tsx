// components/AnalysisView.tsx â€” Analyse avec questionnaire multi-Ã©tapes
// AlignÃ© avec FrontEnd/components/AnalysisView.tsx

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Policy, OptimizationFinding, UserProfileData, User } from '../types';
import { detectOptimizations } from '../services/geminiService';
import { authService } from '../services/authService';
import { Card } from './ui/Card';
import { Button } from './ui/Button';
import { formatCurrency } from '../utils/formatters';

interface Props {
  policies: Policy[];
  profile: UserProfileData;
  user: User;
}

type StepId = 'personal' | 'housing' | 'lifestyle' | 'finance' | 'health' | 'history';

const STEPS: { id: StepId; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { id: 'personal',  label: 'Famille',           icon: 'people-outline' },
  { id: 'housing',   label: 'Habitat',            icon: 'home-outline' },
  { id: 'lifestyle', label: 'Loisirs',            icon: 'compass-outline' },
  { id: 'finance',   label: 'Finances',           icon: 'wallet-outline' },
  { id: 'health',    label: 'SantÃ©',              icon: 'heart-outline' },
  { id: 'history',   label: 'AntÃ©cÃ©dents',        icon: 'time-outline' },
];

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

export function AnalysisView({ policies, profile: initialProfile, user }: Props) {
  const [profile, setProfile] = useState<UserProfileData>(initialProfile);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [findings, setFindings] = useState<OptimizationFinding[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [phase, setPhase] = useState<'questionnaire' | 'results'>('questionnaire');

  useEffect(() => {
    authService.getAnalysisProfile()
      .then(saved => { if (saved && Object.keys(saved).length > 0) setProfile(saved); })
      .catch(() => {});
  }, []);

  const up = (patch: Partial<UserProfileData>) => setProfile(prev => ({ ...prev, ...patch }));
  const upNum = (field: keyof UserProfileData, delta: number) => {
    const v = Math.max(0, ((profile[field] as number) || 0) + delta);
    setProfile(prev => ({ ...prev, [field]: v }));
  };

  const handleAnalyze = async () => {
    setIsAnalyzing(true);
    try {
      await authService.updateAnalysisProfile(profile).catch(() => {});
      const results = await detectOptimizations(policies, profile);
      setFindings(results);
      setPhase('results');
    } catch { /* ignore */ } finally {
      setIsAnalyzing(false);
    }
  };

  const handleNext = () => {
    if (currentStepIndex < STEPS.length - 1) setCurrentStepIndex(i => i + 1);
    else handleAnalyze();
  };

  const handleBack = () => {
    if (phase === 'results') {
      setPhase('questionnaire');
      setCurrentStepIndex(STEPS.length - 1);
    } else if (currentStepIndex > 0) {
      setCurrentStepIndex(i => i - 1);
    }
  };

  const currentStep = STEPS[currentStepIndex];
  const progress = Math.round(((currentStepIndex + 1) / STEPS.length) * 100);
  const totalMembers = (profile.adultsCount || 1) + (profile.childrenCount || 0);

  // â”€â”€ RESULTS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (phase === 'results') {
    if (isAnalyzing) {
      return (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#0ea5e9" />
          <Text style={styles.centerSub}>Analyse en coursâ€¦</Text>
        </View>
      );
    }
    const totalSaving = findings.reduce((s, f) => s + (f.estimatedSaving || 0), 0);
    return (
      <ScrollView style={styles.flex} contentContainerStyle={styles.container}>
        <Card elevated style={styles.summaryCard}>
          <Text style={styles.summaryTitle}>{findings.length} recommandation{findings.length !== 1 ? 's' : ''}</Text>
          {totalSaving > 0 && (
            <Text style={styles.summarySaving}>ðŸ’¡ Ã‰conomie potentielle : {formatCurrency(totalSaving)}/an</Text>
          )}
          <View style={styles.summaryActions}>
            <Button label="Modifier le profil" variant="secondary" onPress={handleBack} style={styles.flex} />
            <Button label="Relancer" onPress={handleAnalyze} loading={isAnalyzing} style={styles.flex} />
          </View>
        </Card>

        {findings.length === 0 ? (
          <Card style={styles.nothingCard}>
            <Ionicons name="checkmark-circle" size={36} color="#22c55e" />
            <Text style={styles.nothingText}>Portefeuille optimisÃ© !</Text>
            <Text style={styles.nothingSubtext}>Aucune recommandation particuliÃ¨re pour vos contrats.</Text>
          </Card>
        ) : (
          findings.map((f, idx) => {
            const cfg = TYPE_CONFIG[f.type] ?? TYPE_CONFIG.saving;
            return (
              <Card key={idx} elevated style={StyleSheet.flatten([styles.findingCard, { borderLeftColor: cfg.text }]) as any}>
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
                    <Text style={styles.savingText}>ðŸ’° {formatCurrency(f.estimatedSaving)}/an d'Ã©conomie</Text>
                  </View>
                )}
                <View style={styles.recommendationBox}>
                  <Text style={styles.recommendationLabel}>Action recommandÃ©e</Text>
                  <Text style={styles.recommendationText}>{f.recommendation}</Text>
                </View>
              </Card>
            );
          })
        )}
      </ScrollView>
    );
  }

  // â”€â”€ QUESTIONNAIRE â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">

      {/* Progress header */}
      <Card style={styles.progressCard}>
        <View style={styles.progressTop}>
          <View style={styles.progressLabel}>
            <View style={styles.progressIconBox}>
              <Ionicons name={currentStep.icon} size={16} color="#fff" />
            </View>
            <View>
              <Text style={styles.progressStep}>Ã‰tape {currentStepIndex + 1}</Text>
              <Text style={styles.progressStepName}>{currentStep.label.toUpperCase()}</Text>
            </View>
          </View>
          <View style={styles.progressBadge}>
            <Text style={styles.progressBadgeText}>{progress}%</Text>
          </View>
        </View>
        <View style={styles.progressBar}>
          {STEPS.map((_, idx) => (
            <View
              key={idx}
              style={[styles.progressBarSegment, { backgroundColor: idx <= currentStepIndex ? '#0ea5e9' : '#e2e8f0' }]}
            />
          ))}
        </View>
      </Card>

      {/* Step content */}
      <Card elevated style={styles.stepCard}>

        {/* â”€â”€ Ã‰TAPE 1 : Famille â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        {currentStep.id === 'personal' && (
          <View style={styles.stepContent}>
            <StepCounter
              label="Nombre d'adultes"
              icon="people"
              value={profile.adultsCount || 1}
              onDecrement={() => upNum('adultsCount', -1)}
              onIncrement={() => upNum('adultsCount', 1)}
            />
            <StepCounter
              label="Enfants Ã  charge"
              icon="heart"
              value={profile.childrenCount || 0}
              onDecrement={() => upNum('childrenCount', -1)}
              onIncrement={() => upNum('childrenCount', 1)}
            />
            {totalMembers > 0 && (
              <View style={styles.ageGrid}>
                <Text style={styles.fieldLabel}>Ã‚ge des membres du foyer</Text>
                <View style={styles.ageInputRow}>
                  {Array.from({ length: Math.min(totalMembers, 6) }).map((_, i) => (
                    <View key={i} style={styles.ageInputWrap}>
                      <Text style={styles.ageLabel}>M.{i + 1}</Text>
                      <TextInput
                        style={styles.ageInput}
                        keyboardType="numeric"
                        value={profile.householdMembersAges?.[i]?.toString() || ''}
                        onChangeText={v => {
                          const ages = [...(profile.householdMembersAges || [])];
                          ages[i] = parseInt(v) || 0;
                          up({ householdMembersAges: ages });
                        }}
                        placeholder="Ã‚ge"
                        maxLength={3}
                      />
                    </View>
                  ))}
                </View>
              </View>
            )}
          </View>
        )}

        {/* â”€â”€ Ã‰TAPE 2 : Habitat â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        {currentStep.id === 'housing' && (
          <View style={styles.stepContent}>
            <View style={styles.fieldRow}>
              <View style={styles.fieldHalf}>
                <Text style={styles.fieldLabel}>Code postal</Text>
                <TextInput style={styles.textInput} value={profile.postalCode || ''} onChangeText={v => up({ postalCode: v })} placeholder="75001" maxLength={5} keyboardType="numeric" />
              </View>
              <View style={styles.fieldHalf}>
                <Text style={styles.fieldLabel}>AnnÃ©e de construction</Text>
                <TextInput style={styles.textInput} value={profile.constructionYear?.toString() || ''} onChangeText={v => up({ constructionYear: parseInt(v) || 0 })} placeholder="1980" keyboardType="numeric" />
              </View>
            </View>

            <ChipGroup
              label="Type de logement"
              options={[{ id: 'house', label: 'Maison ðŸ ' }, { id: 'apartment', label: 'Appartement ðŸ¢' }]}
              selected={profile.housingType || ''}
              onSelect={v => up({ housingType: v as any })}
            />
            <ChipGroup
              label="Statut de rÃ©sidence"
              options={[{ id: 'owner', label: 'PropriÃ©taire' }, { id: 'tenant', label: 'Locataire' }, { id: 'landlord', label: 'Bailleur' }]}
              selected={profile.housingStatus || ''}
              onSelect={v => up({ housingStatus: v as any })}
            />
            <View style={styles.fieldRow}>
              <View style={styles.fieldHalf}>
                <ChipGroup
                  label="RÃ©sidence"
                  options={[{ id: 'principal', label: 'Principale' }, { id: 'secondary', label: 'Secondaire' }]}
                  selected={profile.residenceType || ''}
                  onSelect={v => up({ residenceType: v as any })}
                />
              </View>
              <View style={styles.fieldHalf}>
                <Text style={styles.fieldLabel}>Surface (mÂ²)</Text>
                <TextInput style={styles.textInput} value={profile.housingSurface?.toString() || ''} onChangeText={v => up({ housingSurface: parseInt(v) || 0 })} placeholder="80" keyboardType="numeric" />
              </View>
            </View>

            <View style={styles.toggleRow}>
              <ToggleCard label="Piscine" icon="water" active={!!profile.hasPool} onToggle={() => up({ hasPool: !profile.hasPool })} activeColor="#0ea5e9" />
              <ToggleCard label="Jardin" icon="leaf" active={!!profile.hasGarden} onToggle={() => up({ hasGarden: !profile.hasGarden })} activeColor="#16a34a" />
            </View>
          </View>
        )}

        {/* â”€â”€ Ã‰TAPE 3 : Loisirs â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        {currentStep.id === 'lifestyle' && (
          <View style={styles.stepContent}>
            <View style={styles.petRow}>
              <View style={styles.petLabel}>
                <Ionicons name="paw" size={20} color="#d97706" />
                <Text style={styles.petText}>Animaux de compagnie ?</Text>
              </View>
              <View style={styles.segmented}>
                <TouchableOpacity style={[styles.segment, !profile.hasPets && styles.segmentActive]} onPress={() => up({ hasPets: false })}>
                  <Text style={[styles.segmentText, !profile.hasPets && styles.segmentTextActive]}>Non</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.segment, profile.hasPets && styles.segmentActiveAmber]} onPress={() => up({ hasPets: true })}>
                  <Text style={[styles.segmentText, profile.hasPets && styles.segmentTextActive]}>Oui</Text>
                </TouchableOpacity>
              </View>
            </View>
            {profile.hasPets && (
              <TextInput style={styles.textInput} value={profile.petDetails || ''} onChangeText={v => up({ petDetails: v })} placeholder="Ex: 2 chats, 1 labradorâ€¦" />
            )}

            <StepCounter label="VÃ©hicules" icon="car" value={profile.vehiclesCount || 0} onDecrement={() => upNum('vehiclesCount', -1)} onIncrement={() => upNum('vehiclesCount', 1)} darkBg />
            <StepCounter label="TÃ©lÃ©travail (jours/sem)" icon="briefcase" value={profile.teleworkDays || 0} onDecrement={() => upNum('teleworkDays', -1)} onIncrement={() => upNum('teleworkDays', 1)} primaryBg />

            <ChipGroup
              label="Situation professionnelle"
              options={[
                { id: 'salariÃ©', label: 'SalariÃ©' },
                { id: 'indÃ©pendant', label: 'IndÃ©pendant' },
                { id: 'fonctionnaire', label: 'Fonctionnaire' },
                { id: 'retraitÃ©', label: 'RetraitÃ©' },
                { id: 'sans-emploi', label: 'Sans emploi' },
              ]}
              selected={profile.workStatus || ''}
              onSelect={v => up({ workStatus: v as any })}
            />

            <View>
              <Text style={styles.fieldLabel}>Sports Ã  risque</Text>
              <View style={styles.tagGrid}>
                {['Ski alpin', 'Moto', 'Escalade', 'PlongÃ©e', 'Parachutisme', 'VTT', 'Arts martiaux'].map(sport => {
                  const active = (profile.riskySports || []).includes(sport);
                  return (
                    <TouchableOpacity
                      key={sport}
                      style={[styles.tag, active && styles.tagActive]}
                      onPress={() => {
                        const cur = profile.riskySports || [];
                        up({ riskySports: active ? cur.filter(s => s !== sport) : [...cur, sport] });
                      }}
                    >
                      <Text style={[styles.tagText, active && styles.tagTextActive]}>{sport}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          </View>
        )}

        {/* â”€â”€ Ã‰TAPE 4 : Finances â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        {currentStep.id === 'finance' && (
          <View style={styles.stepContent}>
            <View style={styles.incomeBox}>
              <Ionicons name="wallet" size={28} color="#16a34a" />
              <Text style={styles.incomeTitle}>Budget mensuel</Text>
              <View style={styles.incomeInputWrap}>
                <TextInput
                  style={styles.incomeInput}
                  value={profile.monthlyIncome?.toString() || ''}
                  onChangeText={v => up({ monthlyIncome: parseInt(v) || 0 })}
                  keyboardType="numeric"
                  placeholder="0"
                />
                <Text style={styles.incomeCurrency}>â‚¬</Text>
              </View>
            </View>

            <Text style={styles.fieldLabel}>Valeur du patrimoine assurÃ©</Text>
            <View style={styles.fieldRow}>
              <View style={styles.fieldHalf}>
                <Text style={styles.fieldSubLabel}>Valeur reconstruction logement</Text>
                <TextInput style={styles.textInput} value={profile.reconstructionValue?.toString() || ''} onChangeText={v => up({ reconstructionValue: parseInt(v) || 0 })} placeholder="150 000" keyboardType="numeric" />
              </View>
              <View style={styles.fieldHalf}>
                <Text style={styles.fieldSubLabel}>High-tech & informatique</Text>
                <TextInput style={styles.textInput} value={profile.highTechValue?.toString() || ''} onChangeText={v => up({ highTechValue: parseInt(v) || 0 })} placeholder="3 000" keyboardType="numeric" />
              </View>
            </View>
          </View>
        )}

        {/* â”€â”€ Ã‰TAPE 5 : SantÃ© â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        {currentStep.id === 'health' && (
          <View style={styles.stepContent}>
            <Text style={styles.fieldLabel}>PrioritÃ©s de soins</Text>
            <View style={styles.healthGrid}>
              {[
                { label: 'Optique', icon: 'ðŸ‘' },
                { label: 'Dentaire', icon: 'ðŸ¦·' },
                { label: 'Hospitalisation', icon: 'ðŸ¥' },
                { label: 'MÃ©decine douce', icon: 'ðŸŒ¿' },
                { label: 'Audition', icon: 'ðŸ‘‚' },
                { label: 'MaternitÃ©', icon: 'ðŸ‘¶' },
              ].map(({ label, icon }) => {
                const active = (profile.healthNeeds || []).includes(label);
                return (
                  <TouchableOpacity
                    key={label}
                    style={[styles.healthChip, active && styles.healthChipActive]}
                    onPress={() => {
                      const cur = profile.healthNeeds || [];
                      up({ healthNeeds: active ? cur.filter(n => n !== label) : [...cur, label] });
                    }}
                  >
                    <Text style={styles.healthChipIcon}>{icon}</Text>
                    <Text style={[styles.healthChipText, active && styles.healthChipTextActive]}>{label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={styles.fieldLabel}>Situation particuliÃ¨re (optionnel)</Text>
            <TextInput
              style={[styles.textInput, styles.textArea]}
              value={profile.healthSpecifics || ''}
              onChangeText={v => up({ healthSpecifics: v })}
              placeholder="Ex: traitement au long cours, ALD, grossesse prÃ©vueâ€¦"
              multiline
              numberOfLines={3}
            />
          </View>
        )}

        {/* â”€â”€ Ã‰TAPE 6 : AntÃ©cÃ©dents â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        {currentStep.id === 'history' && (
          <View style={styles.stepContent}>
            <View style={styles.claimsBox}>
              <Text style={styles.claimsTitle}>Sinistres sur 5 ans</Text>
              <Text style={styles.claimsSubtitle}>Auto & Habitation cumulÃ©s</Text>
              <View style={styles.stepper}>
                <TouchableOpacity style={styles.stepperBtn} onPress={() => upNum('claimsLast5Years', -1)}>
                  <Text style={styles.stepperBtnText}>âˆ’</Text>
                </TouchableOpacity>
                <Text style={styles.stepperValue}>{profile.claimsLast5Years || 0}</Text>
                <TouchableOpacity style={styles.stepperBtn} onPress={() => upNum('claimsLast5Years', 1)}>
                  <Text style={styles.stepperBtnText}>+</Text>
                </TouchableOpacity>
              </View>
            </View>

            <Text style={styles.fieldLabel}>TolÃ©rance au risque</Text>
            <View style={styles.riskRow}>
              {[
                { val: 1, label: 'SÃ©curitÃ©\nmax', color: '#16a34a' },
                { val: 2, label: 'Prudent', color: '#0d9488' },
                { val: 3, label: 'Ã‰quilibrÃ©', color: '#0ea5e9' },
                { val: 4, label: 'Dynamique', color: '#f59e0b' },
                { val: 5, label: 'RisquÃ©', color: '#ef4444' },
              ].map(({ val, label, color }) => {
                const active = profile.riskTolerance === val;
                return (
                  <TouchableOpacity
                    key={val}
                    style={[styles.riskBtn, active && { backgroundColor: color, borderColor: color }]}
                    onPress={() => up({ riskTolerance: val })}
                  >
                    <Text style={[styles.riskVal, active && styles.riskValActive]}>{val}</Text>
                    <Text style={[styles.riskLabel, active && styles.riskLabelActive]}>{label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}
      </Card>

      {/* Navigation */}
      <View style={styles.navRow}>
        <TouchableOpacity
          style={[styles.navBtn, currentStepIndex === 0 && styles.navBtnDisabled]}
          onPress={handleBack}
          disabled={currentStepIndex === 0}
        >
          <Ionicons name="arrow-back" size={20} color={currentStepIndex === 0 ? '#cbd5e1' : '#0f172a'} />
          <Text style={[styles.navBtnText, currentStepIndex === 0 && styles.navBtnTextDisabled]}>PrÃ©cÃ©dent</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.navNextBtn} onPress={handleNext} disabled={isAnalyzing}>
          {isAnalyzing ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <Text style={styles.navNextText}>
                {currentStepIndex < STEPS.length - 1 ? 'Suivant' : 'Analyser'}
              </Text>
              <Ionicons name={currentStepIndex < STEPS.length - 1 ? 'arrow-forward' : 'sparkles'} size={18} color="#fff" />
            </>
          )}
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

// â”€â”€ Sub-components â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function StepCounter({ label, icon, value, onDecrement, onIncrement, darkBg, primaryBg }: {
  label: string; icon: keyof typeof Ionicons.glyphMap; value: number;
  onDecrement: () => void; onIncrement: () => void;
  darkBg?: boolean; primaryBg?: boolean;
}) {
  const bg = darkBg ? '#0f172a' : primaryBg ? '#0ea5e9' : '#f8fafc';
  const textColor = darkBg || primaryBg ? '#fff' : '#0f172a';
  const subColor = darkBg ? '#64748b' : primaryBg ? 'rgba(255,255,255,0.7)' : '#94a3b8';
  const btnBorder = darkBg || primaryBg ? 'rgba(255,255,255,0.2)' : '#e2e8f0';
  return (
    <View style={[styles.counterRow, { backgroundColor: bg }]}>
      <View style={styles.counterLeft}>
        <View style={[styles.counterIcon, { backgroundColor: darkBg || primaryBg ? 'rgba(255,255,255,0.1)' : '#fff' }]}>
          <Ionicons name={icon} size={20} color={darkBg || primaryBg ? '#fff' : '#64748b'} />
        </View>
        <Text style={[styles.counterLabel, { color: textColor }]}>{label}</Text>
      </View>
      <View style={styles.counterRight}>
        <TouchableOpacity style={[styles.counterBtn, { borderColor: btnBorder }]} onPress={onDecrement}>
          <Text style={[styles.counterBtnText, { color: textColor }]}>âˆ’</Text>
        </TouchableOpacity>
        <Text style={[styles.counterValue, { color: primaryBg ? '#fff' : '#0ea5e9' }]}>{value}</Text>
        <TouchableOpacity style={[styles.counterBtn, { borderColor: btnBorder }]} onPress={onIncrement}>
          <Text style={[styles.counterBtnText, { color: textColor }]}>+</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function ChipGroup({ label, options, selected, onSelect }: {
  label: string; options: { id: string; label: string }[];
  selected: string; onSelect: (id: string) => void;
}) {
  return (
    <View>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.chipGroup}>
        {options.map(o => (
          <TouchableOpacity
            key={o.id}
            style={[styles.chip, selected === o.id && styles.chipSelected]}
            onPress={() => onSelect(o.id)}
          >
            <Text style={[styles.chipText, selected === o.id && styles.chipTextSelected]}>{o.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

function ToggleCard({ label, icon, active, onToggle, activeColor }: {
  label: string; icon: keyof typeof Ionicons.glyphMap;
  active: boolean; onToggle: () => void; activeColor: string;
}) {
  return (
    <TouchableOpacity
      style={[styles.toggleCard, active && { backgroundColor: activeColor, borderColor: activeColor }]}
      onPress={onToggle}
    >
      <View style={[styles.toggleIconBox, active && { backgroundColor: 'rgba(255,255,255,0.2)' }]}>
        <Ionicons name={icon} size={22} color={active ? '#fff' : '#94a3b8'} />
      </View>
      <Text style={[styles.toggleLabel, active && { color: '#fff' }]}>{label}</Text>
    </TouchableOpacity>
  );
}

// â”€â”€ Styles â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#f8fafc' },
  container: { padding: 16, paddingBottom: 40, gap: 12 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, backgroundColor: '#f8fafc' },
  centerSub: { fontSize: 14, color: '#64748b' },

  // Progress card
  progressCard: { gap: 10 },
  progressTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  progressLabel: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  progressIconBox: {
    width: 32, height: 32, borderRadius: 10,
    backgroundColor: '#0ea5e9', alignItems: 'center', justifyContent: 'center',
  },
  progressStep: { fontSize: 10, fontWeight: '800', color: '#94a3b8', textTransform: 'uppercase' },
  progressStepName: { fontSize: 12, fontWeight: '800', color: '#0f172a' },
  progressBadge: { backgroundColor: '#f0f9ff', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  progressBadgeText: { fontSize: 11, fontWeight: '800', color: '#0ea5e9' },
  progressBar: { flexDirection: 'row', gap: 3, height: 4 },
  progressBarSegment: { flex: 1, borderRadius: 4 },

  // Step card
  stepCard: {},
  stepContent: { gap: 16 },

  // Counter row
  counterRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 16, borderRadius: 16, gap: 12,
  },
  counterLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  counterIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  counterLabel: { fontSize: 13, fontWeight: '700' },
  counterRight: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  counterBtn: {
    width: 36, height: 36, borderRadius: 10, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },
  counterBtnText: { fontSize: 18, fontWeight: '700' },
  counterValue: { fontSize: 24, fontWeight: '800', width: 40, textAlign: 'center' },

  // Age grid
  ageGrid: { gap: 8 },
  ageInputRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  ageInputWrap: { alignItems: 'center', gap: 2 },
  ageLabel: { fontSize: 10, color: '#94a3b8', fontWeight: '700' },
  ageInput: {
    width: 56, borderRadius: 12, backgroundColor: '#f1f5f9',
    borderWidth: 1, borderColor: '#e2e8f0', textAlign: 'center',
    padding: 10, fontSize: 14, fontWeight: '700', color: '#0f172a',
  },

  // Field
  fieldLabel: { fontSize: 11, fontWeight: '800', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 },
  fieldSubLabel: { fontSize: 11, fontWeight: '600', color: '#64748b', marginBottom: 4 },
  fieldRow: { flexDirection: 'row', gap: 12 },
  fieldHalf: { flex: 1 },
  textInput: {
    backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0',
    borderRadius: 12, padding: 12, fontSize: 14, fontWeight: '600', color: '#0f172a',
  },
  textArea: { height: 80, textAlignVertical: 'top', paddingTop: 10 },

  // Chips
  chipGroup: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 8,
    backgroundColor: '#f1f5f9', borderWidth: 1, borderColor: '#e2e8f0',
  },
  chipSelected: { backgroundColor: '#0ea5e9', borderColor: '#0ea5e9' },
  chipText: { fontSize: 12, fontWeight: '700', color: '#475569' },
  chipTextSelected: { color: '#fff' },

  // Toggle cards
  toggleRow: { flexDirection: 'row', gap: 12 },
  toggleCard: {
    flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8,
    padding: 16, borderRadius: 16, borderWidth: 2, borderColor: '#e2e8f0', backgroundColor: '#f8fafc',
  },
  toggleIconBox: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  toggleLabel: { fontSize: 11, fontWeight: '800', color: '#94a3b8', textTransform: 'uppercase' },

  // Pet row
  petRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#fffbeb', borderRadius: 16, padding: 14, borderWidth: 1, borderColor: '#fde68a' },
  petLabel: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  petText: { fontSize: 14, fontWeight: '700', color: '#92400e' },
  segmented: { flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.5)', borderRadius: 10, padding: 3, borderWidth: 1, borderColor: '#fde68a' },
  segment: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 8 },
  segmentActive: { backgroundColor: '#fff' },
  segmentActiveAmber: { backgroundColor: '#d97706' },
  segmentText: { fontSize: 12, fontWeight: '700', color: '#d97706' },
  segmentTextActive: { color: '#fff' },

  // Tags
  tagGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  tag: { borderRadius: 12, paddingHorizontal: 12, paddingVertical: 7, backgroundColor: '#f1f5f9', borderWidth: 1, borderColor: '#e2e8f0' },
  tagActive: { backgroundColor: '#e11d48', borderColor: '#e11d48' },
  tagText: { fontSize: 12, fontWeight: '700', color: '#475569' },
  tagTextActive: { color: '#fff' },

  // Income
  incomeBox: { alignItems: 'center', backgroundColor: '#f0fdf4', borderRadius: 16, padding: 24, gap: 8, borderWidth: 1, borderColor: '#bbf7d0' },
  incomeTitle: { fontSize: 16, fontWeight: '800', color: '#15803d' },
  incomeInputWrap: { flexDirection: 'row', alignItems: 'center' },
  incomeInput: { fontSize: 36, fontWeight: '800', color: '#0f172a', minWidth: 80, textAlign: 'center', padding: 8 },
  incomeCurrency: { fontSize: 24, fontWeight: '800', color: '#94a3b8', marginLeft: 4 },

  // Health grid
  healthGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  healthChip: {
    width: '47%', alignItems: 'center', gap: 6, padding: 14,
    borderRadius: 16, borderWidth: 2, borderColor: '#e2e8f0', backgroundColor: '#f8fafc',
  },
  healthChipActive: { backgroundColor: '#0ea5e9', borderColor: '#0ea5e9' },
  healthChipIcon: { fontSize: 22 },
  healthChipText: { fontSize: 11, fontWeight: '800', color: '#94a3b8', textTransform: 'uppercase' },
  healthChipTextActive: { color: '#fff' },

  // Claims
  claimsBox: { backgroundColor: '#0f172a', borderRadius: 20, padding: 24, alignItems: 'center', gap: 6 },
  claimsTitle: { fontSize: 18, fontWeight: '800', color: '#fff' },
  claimsSubtitle: { fontSize: 12, fontWeight: '700', color: '#475569', textTransform: 'uppercase' },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 20, marginTop: 8 },
  stepperBtn: { width: 52, height: 52, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  stepperBtnText: { fontSize: 24, fontWeight: '700', color: '#fff' },
  stepperValue: { fontSize: 52, fontWeight: '800', color: '#0ea5e9', width: 64, textAlign: 'center' },

  // Risk
  riskRow: { flexDirection: 'row', gap: 6 },
  riskBtn: {
    flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 14,
    borderRadius: 12, borderWidth: 2, borderColor: '#e2e8f0', backgroundColor: '#f8fafc', gap: 4,
  },
  riskVal: { fontSize: 18, fontWeight: '800', color: '#94a3b8' },
  riskValActive: { color: '#fff' },
  riskLabel: { fontSize: 8, fontWeight: '800', color: '#94a3b8', textTransform: 'uppercase', textAlign: 'center' },
  riskLabelActive: { color: 'rgba(255,255,255,0.8)' },

  // Navigation
  navRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  navBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: 12 },
  navBtnDisabled: { opacity: 0.3 },
  navBtnText: { fontSize: 14, fontWeight: '700', color: '#0f172a' },
  navBtnTextDisabled: { color: '#cbd5e1' },
  navNextBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#0ea5e9', paddingHorizontal: 24, paddingVertical: 14,
    borderRadius: 14,
  },
  navNextText: { fontSize: 15, fontWeight: '800', color: '#fff' },

  // Results
  summaryCard: { gap: 10 },
  summaryTitle: { fontSize: 18, fontWeight: '800', color: '#0f172a' },
  summarySaving: { fontSize: 14, color: '#16a34a', fontWeight: '700' },
  summaryActions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  nothingCard: { alignItems: 'center', gap: 8, padding: 24 },
  nothingText: { fontSize: 18, fontWeight: '700', color: '#0f172a' },
  nothingSubtext: { fontSize: 13, color: '#64748b', textAlign: 'center' },
  findingCard: { borderLeftWidth: 4 },
  findingHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 8 },
  findingIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  findingHeaderText: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  findingTitle: { fontSize: 15, fontWeight: '700', color: '#0f172a', flex: 1 },
  severityDot: { width: 8, height: 8, borderRadius: 4 },
  findingDesc: { fontSize: 13, color: '#475569', lineHeight: 20, marginBottom: 8 },
  savingBadge: { backgroundColor: '#f0fdf4', borderRadius: 8, padding: 8, borderWidth: 1, borderColor: '#bbf7d0', marginBottom: 8 },
  savingText: { fontSize: 13, color: '#15803d', fontWeight: '700' },
  recommendationBox: { backgroundColor: '#f8fafc', borderRadius: 10, padding: 10, borderWidth: 1, borderColor: '#e2e8f0' },
  recommendationLabel: { fontSize: 11, fontWeight: '800', color: '#0ea5e9', marginBottom: 4, textTransform: 'uppercase' },
  recommendationText: { fontSize: 13, color: '#0f172a', lineHeight: 20 },
});
