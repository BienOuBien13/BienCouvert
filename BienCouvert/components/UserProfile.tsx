// components/UserProfile.tsx — Profil utilisateur aligné sur le web
// Adapté depuis FrontEnd/components/UserProfile.tsx

import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { User, UserProfileData } from '../types';
import { authService } from '../services/authService';

interface Props {
  user: User;
  onUpdateUser: (user: User) => void;
  onUpdateProfile?: (profile: UserProfileData) => void;
  onLogout: () => void;
  onDeleteAccount?: () => void;
}

export function UserProfile({ user, onUpdateUser, onUpdateProfile, onLogout, onDeleteAccount }: Props) {
  const [firstName, setFirstName] = useState(user.firstName);
  const [lastName, setLastName] = useState(user.lastName);
  const [password, setPassword] = useState('');
  const [profile] = useState<UserProfileData>(user.profile || {
    adultsCount: 1,
    childrenCount: 0,
    housingStatus: 'tenant',
  });
  const [status, setStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [showDeleteZone, setShowDeleteZone] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');

  const ini = `${firstName.charAt(0).toUpperCase()}${lastName.charAt(0).toUpperCase()}`;

  const handleSave = async () => {
    setStatus('saving');
    setErrorMsg('');
    try {
      await new Promise(r => setTimeout(r, 800));
      const updated = await authService.updateUser(user.id, {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        password: password || undefined,
        profile,
      });
      onUpdateUser(updated);
      if (onUpdateProfile) onUpdateProfile(profile);
      setPassword('');
      setStatus('success');
      setTimeout(() => setStatus('idle'), 3000);
    } catch (e: any) {
      setErrorMsg(e.message || 'Erreur lors de la mise à jour.');
      setStatus('error');
    }
  };

  const handleDeleteAccount = async () => {
    if (deleteConfirmText !== 'SUPPRIMER') return;
    try {
      if (onDeleteAccount) {
        onDeleteAccount();
      } else {
        await authService.deleteAccount(user.id);
        onLogout();
      }
    } catch (e: any) {
      setErrorMsg(e.message);
      setStatus('error');
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView style={styles.flex} contentContainerStyle={styles.container}>
        {/* Dark header card — matches web bg-slate-900 rounded-[2.5rem] */}
        <View style={styles.headerCard}>
          <View style={styles.avatarCircle}>
            <Text style={styles.avatarText}>{ini}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.userName}>{firstName} {lastName}</Text>
            <Text style={styles.userEmail}>{user.email}</Text>
          </View>
        </View>

        {/* Form card — matches web bg-white rounded-[2.5rem] */}
        <View style={styles.formCard}>
          {/* Error / Success banners */}
          {status === 'error' && (
            <View style={styles.errorBox}>
              <Ionicons name="shield-outline" size={16} color="#b91c1c" />
              <Text style={styles.errorText}>{errorMsg}</Text>
            </View>
          )}

          {/* Name inputs — 2 fields like web's grid */}
          <View style={styles.fieldRow}>
            <View style={styles.fieldHalf}>
              <Text style={styles.label}>PRÉNOM</Text>
              <View style={styles.inputWrap}>
                <Ionicons name="person-outline" size={18} color="#94a3b8" style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  value={firstName}
                  onChangeText={setFirstName}
                  autoCapitalize="words"
                />
              </View>
            </View>
            <View style={styles.fieldHalf}>
              <Text style={styles.label}>NOM</Text>
              <View style={styles.inputWrap}>
                <Ionicons name="person-outline" size={18} color="#94a3b8" style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  value={lastName}
                  onChangeText={setLastName}
                  autoCapitalize="words"
                />
              </View>
            </View>
          </View>

          {/* Email — disabled, matches web */}
          <View style={styles.fieldFull}>
            <Text style={styles.label}>
              ADRESSE EMAIL <Text style={{ color: '#ef4444' }}>(non modifiable)</Text>
            </Text>
            <View style={[styles.inputWrap, styles.inputDisabledWrap]}>
              <Ionicons name="mail-outline" size={18} color="#94a3b8" style={styles.inputIcon} />
              <TextInput
                style={[styles.input, styles.inputDisabled]}
                value={user.email}
                editable={false}
              />
            </View>
            <Text style={styles.emailNote}>
              L'email est votre identifiant unique et ne peut pas être changé
            </Text>
          </View>

          {/* Password section — matches web's "Changement de mot de passe" */}
          <View style={styles.passwordSection}>
            <View style={styles.passwordHeader}>
              <Ionicons name="lock-closed-outline" size={18} color="#0f172a" />
              <Text style={styles.passwordTitle}>Changement de mot de passe</Text>
            </View>
            <Text style={styles.label}>NOUVEAU MOT DE PASSE</Text>
            <TextInput
              style={styles.passwordInput}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              placeholder="••••••••"
              placeholderTextColor="#cbd5e1"
            />
            <Text style={styles.passwordHint}>
              Laissez vide pour conserver le mot de passe actuel.
            </Text>
          </View>

          {/* Footer — info + save button, matches web */}
          <View style={styles.footer}>
            <View style={styles.footerInfo}>
              <Ionicons name="information-circle-outline" size={16} color="#94a3b8" />
              <Text style={styles.footerInfoText}>DERNIÈRE MISE À JOUR : AUJOURD'HUI</Text>
            </View>

            <TouchableOpacity
              style={[styles.saveBtn, status === 'saving' && styles.saveBtnDisabled]}
              onPress={handleSave}
              disabled={status === 'saving'}
              activeOpacity={0.8}
            >
              {status === 'saving' ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : status === 'success' ? (
                <Ionicons name="checkmark" size={18} color="#fff" />
              ) : (
                <Ionicons name="save-outline" size={18} color="#fff" />
              )}
              <Text style={styles.saveBtnText}>
                {status === 'saving'
                  ? 'Enregistrement...'
                  : status === 'success'
                  ? 'Profil Sauvegardé'
                  : 'Enregistrer les modifications'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Logout — mobile-specific action */}
        <TouchableOpacity style={styles.logoutCard} onPress={onLogout} activeOpacity={0.7}>
          <Ionicons name="log-out-outline" size={20} color="#f59e0b" />
          <Text style={styles.logoutText}>Se déconnecter</Text>
        </TouchableOpacity>

        {/* Danger zone — matches web's SUPPRIMER confirmation */}
        <View style={styles.dangerCard}>
          <Text style={styles.dangerTitle}>🗑️ Zone de danger</Text>
          <Text style={styles.dangerSubtext}>
            La suppression de votre compte est{' '}
            <Text style={styles.dangerBold}>définitive et irréversible</Text>.
            Toutes vos données (contrats, profil, documents) seront définitivement supprimées.
          </Text>

          {!showDeleteZone ? (
            <TouchableOpacity style={styles.dangerBtn} onPress={() => setShowDeleteZone(true)} activeOpacity={0.7}>
              <Text style={styles.dangerBtnText}>Supprimer mon compte</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.deleteConfirm}>
              <Text style={styles.deleteConfirmLabel}>
                Pour confirmer, tapez «{' '}
                <Text style={styles.deleteConfirmCode}>SUPPRIMER</Text> » ci-dessous :
              </Text>
              <TextInput
                style={styles.deleteInput}
                value={deleteConfirmText}
                onChangeText={setDeleteConfirmText}
                placeholder="SUPPRIMER"
                placeholderTextColor="#cbd5e1"
                autoCapitalize="characters"
              />
              <View style={styles.deleteActions}>
                <TouchableOpacity
                  style={styles.cancelBtn}
                  onPress={() => { setShowDeleteZone(false); setDeleteConfirmText(''); }}
                >
                  <Text style={styles.cancelBtnText}>Annuler</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.confirmDeleteBtn, deleteConfirmText !== 'SUPPRIMER' && styles.confirmDeleteBtnDisabled]}
                  onPress={handleDeleteAccount}
                  disabled={deleteConfirmText !== 'SUPPRIMER'}
                >
                  <Text style={styles.confirmDeleteText}>Confirmer la suppression</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#f8fafc' },
  container: { padding: 16, paddingBottom: 40, gap: 16 },

  /* Dark header — bg-slate-900 rounded-[2.5rem] */
  headerCard: {
    backgroundColor: '#0f172a',
    borderRadius: 40,
    padding: 28,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
  },
  avatarCircle: {
    width: 72,
    height: 72,
    borderRadius: 24,
    backgroundColor: '#0ea5e9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 26, fontWeight: '900', color: '#fff' },
  userName: { fontSize: 22, fontWeight: '900', color: '#fff', letterSpacing: -0.5 },
  userEmail: { fontSize: 13, color: '#38bdf8', marginTop: 3 },

  /* Form card — bg-white rounded-[2.5rem] */
  formCard: {
    backgroundColor: '#fff',
    borderRadius: 40,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 24,
    gap: 20,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#fef2f2',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#fecaca',
    padding: 14,
  },
  errorText: { color: '#b91c1c', fontSize: 13, fontWeight: '700', flex: 1 },

  /* Labels — text-[10px] font-black uppercase tracking-widest */
  label: {
    fontSize: 10,
    fontWeight: '900',
    color: '#94a3b8',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    marginBottom: 6,
    marginLeft: 2,
  },

  /* Input fields with icon prefix */
  fieldRow: { flexDirection: 'row', gap: 12 },
  fieldHalf: { flex: 1 },
  fieldFull: {},
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#f1f5f9',
    borderRadius: 16,
    overflow: 'hidden',
  },
  inputDisabledWrap: { backgroundColor: '#f1f5f9', borderColor: '#e2e8f0' },
  inputIcon: { marginLeft: 14 },
  input: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 10,
    fontSize: 15,
    fontWeight: '700',
    color: '#0f172a',
  },
  inputDisabled: { color: '#64748b' },
  emailNote: { fontSize: 11, color: '#64748b', marginTop: 4, marginLeft: 2 },

  /* Password section */
  passwordSection: {
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#f8fafc',
  },
  passwordHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
  passwordTitle: { fontSize: 16, fontWeight: '900', color: '#0f172a' },
  passwordInput: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#f1f5f9',
    borderRadius: 16,
    paddingHorizontal: 20,
    paddingVertical: 14,
    fontSize: 15,
    fontWeight: '700',
    color: '#0f172a',
  },
  passwordHint: { fontSize: 10, color: '#94a3b8', fontStyle: 'italic', marginTop: 4, marginLeft: 2 },

  /* Footer */
  footer: { paddingTop: 20, borderTopWidth: 1, borderTopColor: '#f1f5f9', gap: 16 },
  footerInfo: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  footerInfoText: { fontSize: 10, fontWeight: '700', color: '#94a3b8', letterSpacing: 1.5, textTransform: 'uppercase' },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: '#0ea5e9',
    borderRadius: 16,
    paddingVertical: 16,
  },
  saveBtnDisabled: { opacity: 0.7 },
  saveBtnText: { color: '#fff', fontSize: 14, fontWeight: '900' },

  /* Logout */
  logoutCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#fff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 16,
  },
  logoutText: { fontSize: 15, fontWeight: '600', color: '#f59e0b' },

  /* Danger zone */
  dangerCard: {
    backgroundColor: '#fef2f2',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#fecaca',
    padding: 20,
    gap: 12,
  },
  dangerTitle: { fontSize: 16, fontWeight: '800', color: '#991b1b' },
  dangerSubtext: { fontSize: 13, color: '#7f1d1d', lineHeight: 20 },
  dangerBold: { fontWeight: '700' },
  dangerBtn: {
    borderWidth: 2,
    borderColor: '#ef4444',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  dangerBtnText: { color: '#dc2626', fontWeight: '700', fontSize: 14 },
  deleteConfirm: { gap: 12 },
  deleteConfirmLabel: { fontSize: 13, color: '#7f1d1d', fontWeight: '700' },
  deleteConfirmCode: { fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace', fontWeight: '900' },
  deleteInput: {
    borderWidth: 2,
    borderColor: '#fca5a5',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    color: '#0f172a',
  },
  deleteActions: { flexDirection: 'row', gap: 10 },
  cancelBtn: {
    flex: 1,
    backgroundColor: '#e2e8f0',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  cancelBtnText: { color: '#475569', fontWeight: '700', fontSize: 14 },
  confirmDeleteBtn: {
    flex: 1,
    backgroundColor: '#dc2626',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  confirmDeleteBtnDisabled: { opacity: 0.5 },
  confirmDeleteText: { color: '#fff', fontWeight: '700', fontSize: 14 },
});
