// components/AuthScreen.tsx — Écran d'authentification adapté pour React Native
// Adapté depuis FrontEnd/components/AuthScreen.tsx

import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Input } from './ui/Input';
import { Button } from './ui/Button';
import { authService } from '../services/authService';
import { User } from '../types';

type AuthMode = 'login' | 'register' | 'forgot' | 'email-sent';

interface Props {
  onLogin: (user: User) => void;
}

const validatePassword = (pwd: string): string => {
  if (pwd.length < 6) return 'Au moins 6 caractères.';
  if (!/[A-Z]/.test(pwd)) return 'Au moins 1 majuscule.';
  if (!/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(pwd)) return 'Au moins 1 caractère spécial.';
  return '';
};

export function AuthScreen({ onLogin }: Props) {
  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async () => {
    setError('');
    setIsLoading(true);
    try {
      if (mode === 'login') {
        const user = await authService.login(email, password);
        onLogin(user);
      } else if (mode === 'register') {
        if (!acceptedTerms) throw new Error('Veuillez accepter les CGU.');
        const warn = validatePassword(password);
        if (warn) throw new Error(warn);
        if (password !== confirmPassword) throw new Error('Les mots de passe ne correspondent pas.');
        const user = await authService.register(email, password);
        onLogin(user);
      } else if (mode === 'forgot') {
        const result = await authService.forgotPassword(email);
        if (!result.exists) throw new Error('Aucun compte trouvé avec cet email.');
        setMode('email-sent');
      }
    } catch (e: any) {
      setError(e.message || 'Une erreur est survenue.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        {/* Logo & titre */}
        <View style={styles.header}>
          <View style={styles.logoCircle}>
            <Ionicons name="shield-checkmark" size={36} color="#0ea5e9" />
          </View>
          <Text style={styles.title}>BienCouvert</Text>
          <Text style={styles.subtitle}>
            {mode === 'login' && 'Connectez-vous à votre compte'}
            {mode === 'register' && 'Créez votre compte gratuitement'}
            {mode === 'forgot' && 'Réinitialiser votre mot de passe'}
            {mode === 'email-sent' && 'Email envoyé !'}
          </Text>
        </View>

        {mode === 'email-sent' ? (
          <View style={styles.successBox}>
            <Ionicons name="mail-open-outline" size={48} color="#0ea5e9" />
            <Text style={styles.successTitle}>Vérifiez votre boîte mail</Text>
            <Text style={styles.successText}>
              Un lien de réinitialisation a été envoyé à{' '}
              <Text style={styles.bold}>{email}</Text>.
            </Text>
            <Button label="Retour à la connexion" onPress={() => setMode('login')} style={styles.mt16} />
          </View>
        ) : (
          <View style={styles.form}>
            {/* Onglets Connexion / Inscription (comme le web) */}
            {(mode === 'login' || mode === 'register') && (
              <View style={styles.tabs}>
                <TouchableOpacity
                  style={[styles.tab, mode === 'login' && styles.tabActive]}
                  onPress={() => { setMode('login'); setError(''); }}
                >
                  <Text style={[styles.tabText, mode === 'login' && styles.tabTextActive]}>Connexion</Text>
                  {mode === 'login' && <View style={styles.tabUnderline} />}
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.tab, mode === 'register' && styles.tabActive]}
                  onPress={() => { setMode('register'); setError(''); }}
                >
                  <Text style={[styles.tabText, mode === 'register' && styles.tabTextActive]}>Inscription</Text>
                  {mode === 'register' && <View style={styles.tabUnderline} />}
                </TouchableOpacity>
              </View>
            )}

            {/* Titre pour les modes forgot */}
            {mode === 'forgot' && (
              <Text style={styles.forgotTitle}>Réinitialisation du mot de passe</Text>
            )}

            {error ? (
              <View style={styles.errorBox}>
                <Ionicons name="alert-circle-outline" size={16} color="#b91c1c" />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            <Input
              label="Adresse email"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              placeholder="jean@exemple.com"
            />

            {mode !== 'forgot' && (
              <View style={styles.passwordRow}>
                <Input
                  label="Mot de passe"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                  containerStyle={styles.flex}
                  placeholder="••••••••"
                />
                <TouchableOpacity
                  onPress={() => setShowPassword(v => !v)}
                  style={styles.eyeBtn}
                >
                  <Ionicons
                    name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                    size={20}
                    color="#94a3b8"
                  />
                </TouchableOpacity>
              </View>
            )}

            {mode === 'register' && (
              <>
                <Input
                  label="Confirmer le mot de passe"
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  secureTextEntry={!showPassword}
                  placeholder="••••••••"
                />
                <TouchableOpacity
                  style={styles.termsRow}
                  onPress={() => setAcceptedTerms(v => !v)}
                  activeOpacity={0.8}
                >
                  <View style={[styles.checkbox, acceptedTerms && styles.checkboxChecked]}>
                    {acceptedTerms && <Ionicons name="checkmark" size={12} color="#fff" />}
                  </View>
                  <Text style={styles.termsText}>
                    J'accepte les{' '}
                    <Text style={styles.link}>CGU</Text> et la{' '}
                    <Text style={styles.link}>politique de confidentialité</Text>
                  </Text>
                </TouchableOpacity>
              </>
            )}

            <Button
              label={
                mode === 'login' ? 'Se connecter' :
                mode === 'register' ? 'Créer mon compte' :
                "Envoyer l'email"
              }
              onPress={handleSubmit}
              loading={isLoading}
              style={styles.submitBtn}
            />

            {/* Liens de navigation entre modes */}
            <View style={styles.links}>
              {mode === 'login' && (
                <TouchableOpacity onPress={() => { setError(''); setMode('forgot'); }}>
                  <Text style={styles.link}>Mot de passe oublié ?</Text>
                </TouchableOpacity>
              )}
              {mode === 'forgot' && (
                <TouchableOpacity onPress={() => { setError(''); setMode('login'); }}>
                  <Text style={styles.link}>← Retour à la connexion</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: {
    flexGrow: 1,
    padding: 24,
    backgroundColor: '#f8fafc',
    justifyContent: 'center',
  },
  header: { alignItems: 'center', marginBottom: 32 },
  logoCircle: {
    width: 72,
    height: 72,
    borderRadius: 20,
    backgroundColor: '#e0f2fe',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  title: { fontSize: 26, fontWeight: '800', color: '#0f172a' },
  subtitle: { fontSize: 14, color: '#64748b', marginTop: 4 },
  form: { gap: 16 },
  tabs: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    marginBottom: 4,
  },
  tab: {
    flex: 1,
    paddingBottom: 14,
    alignItems: 'center',
    position: 'relative',
  },
  tabActive: {},
  tabText: { fontSize: 14, fontWeight: '500', color: '#64748b' },
  tabTextActive: { color: '#0ea5e9', fontWeight: '700' },
  tabUnderline: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: '#0ea5e9',
    borderRadius: 2,
  },
  forgotTitle: { fontSize: 16, fontWeight: '700', color: '#0f172a' },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#fef2f2',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  errorText: { color: '#b91c1c', fontSize: 13, flex: 1 },
  passwordRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  eyeBtn: { paddingBottom: 12, paddingHorizontal: 4 },
  termsRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: '#0ea5e9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: { backgroundColor: '#0ea5e9' },
  termsText: { fontSize: 13, color: '#475569', flex: 1 },
  submitBtn: { marginTop: 8 },
  links: { alignItems: 'center', gap: 12, marginTop: 8 },
  link: { color: '#0ea5e9', fontWeight: '600', fontSize: 14 },
  bold: { fontWeight: '700' },
  successBox: { alignItems: 'center', gap: 12, padding: 24 },
  successTitle: { fontSize: 20, fontWeight: '800', color: '#0f172a' },
  successText: { fontSize: 14, color: '#475569', textAlign: 'center' },
  mt16: { marginTop: 16, width: '100%' },
});
