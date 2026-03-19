// components/AuthScreen.tsx — Exact rebuild from FrontEnd/components/AuthScreen.tsx
// Modes: login | register | forgot | email-sent | reset (matching web)

import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Input } from './ui/Input';
import { Button } from './ui/Button';
import { authService } from '../services/authService';
import { User } from '../types';

type AuthMode = 'login' | 'register' | 'forgot' | 'email-sent' | 'reset';

interface Props {
  onLogin: (user: User) => void;
}

const validatePassword = (pwd: string): string => {
  if (pwd.length < 6) return 'Au moins 6 caractères.';
  if (!/[A-Z]/.test(pwd)) return 'Au moins 1 majuscule.';
  if (!/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(pwd))
    return 'Au moins 1 caractère spécial.';
  return '';
};

export function AuthScreen({ onLogin }: Props) {
  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [passwordWarning, setPasswordWarning] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async () => {
    setError('');
    setSuccess('');
    setIsLoading(true);
    try {
      await new Promise((r) => setTimeout(r, 800));

      if (mode === 'login') {
        const user = await authService.login(email, password);
        onLogin(user);
      } else if (mode === 'register') {
        if (!acceptedTerms)
          throw new Error(
            'Veuillez accepter les CGU et la politique de confidentialité.',
          );
        const pwdWarn = validatePassword(password);
        if (pwdWarn) throw new Error('Mot de passe invalide : ' + pwdWarn);
        const user = await authService.register(email, password);
        onLogin(user);
      } else if (mode === 'forgot') {
        const result = await authService.forgotPassword(email);
        if (!result.exists)
          throw new Error('Aucun compte trouvé avec cet email.');
        setMode('email-sent');
      } else if (mode === 'reset') {
        if (password !== confirmPassword)
          throw new Error('Les mots de passe ne correspondent pas.');
        const pwdWarn = validatePassword(password);
        if (pwdWarn) throw new Error('Mot de passe invalide : ' + pwdWarn);
        setSuccess(
          'Mot de passe réinitialisé ! Connectez-vous avec votre nouveau mot de passe.',
        );
        setMode('login');
        setPassword('');
      }
    } catch (e: any) {
      setError(e.message || 'Une erreur est survenue.');
    } finally {
      setIsLoading(false);
    }
  };

  /* ── forgot mode ── */
  const renderForgot = () => (
    <View style={styles.formSection}>
      <Text style={styles.modeDescription}>
        Saisissez votre email pour recevoir un lien sécurisé de
        réinitialisation.
      </Text>
      <Input
        label="Email"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
        placeholder="jean@exemple.com"
      />
      <Button
        label="Envoyer l'email"
        onPress={handleSubmit}
        loading={isLoading}
      />
      <TouchableOpacity
        style={styles.backLink}
        onPress={() => {
          setMode('login');
          setError('');
        }}
      >
        <Ionicons name="arrow-back" size={16} color="#64748b" />
        <Text style={styles.backLinkText}>Retour à la connexion</Text>
      </TouchableOpacity>
    </View>
  );

  /* ── email-sent mode ── */
  const renderEmailSent = () => (
    <View style={styles.emailSentContainer}>
      <View style={styles.emailSentIconCircle}>
        <Ionicons name="mail-open-outline" size={32} color="#059669" />
      </View>
      <Text style={styles.emailSentTitle}>Vérifiez vos emails</Text>
      <Text style={styles.emailSentText}>
        Un email contenant un lien de réinitialisation a été envoyé à{' '}
        <Text style={styles.bold}>{email}</Text>.
      </Text>
      <TouchableOpacity onPress={() => setMode('forgot')}>
        <Text style={styles.linkText}>Email non reçu ? Renvoyer</Text>
      </TouchableOpacity>
    </View>
  );

  /* ── reset mode ── */
  const renderReset = () => (
    <View style={styles.formSection}>
      <Text style={styles.modeDescription}>
        Choisissez un nouveau mot de passe pour votre compte.
      </Text>
      <Input
        label="Nouveau mot de passe"
        value={password}
        onChangeText={(val: string) => {
          setPassword(val);
          setPasswordWarning(validatePassword(val));
        }}
        secureTextEntry={!showPassword}
        placeholder="••••••••"
      />
      {passwordWarning ? (
        <Text style={styles.warningText}>{passwordWarning}</Text>
      ) : null}
      <Input
        label="Confirmer le mot de passe"
        value={confirmPassword}
        onChangeText={setConfirmPassword}
        secureTextEntry={!showPassword}
        placeholder="••••••••"
      />
      <Button
        label="Réinitialiser le mot de passe"
        onPress={handleSubmit}
        loading={isLoading}
      />
    </View>
  );

  /* ── login / register mode ── */
  const renderLoginRegister = () => (
    <View style={styles.formSection}>
      {/* Tabs — exact match: border-b, flex-1, underline indicator */}
      <View style={styles.tabs}>
        <TouchableOpacity
          style={styles.tab}
          onPress={() => {
            setMode('login');
            setError('');
            setSuccess('');
          }}
        >
          <Text
            style={[styles.tabText, mode === 'login' && styles.tabTextActive]}
          >
            Connexion
          </Text>
          {mode === 'login' && <View style={styles.tabUnderline} />}
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.tab}
          onPress={() => {
            setMode('register');
            setError('');
            setSuccess('');
          }}
        >
          <Text
            style={[
              styles.tabText,
              mode === 'register' && styles.tabTextActive,
            ]}
          >
            Inscription
          </Text>
          {mode === 'register' && <View style={styles.tabUnderline} />}
        </TouchableOpacity>
      </View>

      {/* Email */}
      <Input
        label="Email"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
        placeholder="jean@exemple.com"
      />

      {/* Password — login has "Mot de passe oublié?" on same row as label */}
      <View>
        {mode === 'login' && (
          <View style={styles.passwordHeader}>
            <Text style={styles.inputLabel}>Mot de passe</Text>
            <TouchableOpacity
              onPress={() => {
                setMode('forgot');
                setError('');
              }}
            >
              <Text style={styles.forgotLink}>Mot de passe oublié ?</Text>
            </TouchableOpacity>
          </View>
        )}
        <View style={styles.passwordRow}>
          <Input
            label={mode === 'login' ? undefined : 'Mot de passe'}
            value={password}
            onChangeText={(val: string) => {
              setPassword(val);
              if (mode === 'register')
                setPasswordWarning(validatePassword(val));
            }}
            secureTextEntry={!showPassword}
            placeholder="••••••••"
            containerStyle={styles.flex}
          />
          <TouchableOpacity
            onPress={() => setShowPassword((v) => !v)}
            style={styles.eyeBtn}
          >
            <Ionicons
              name={showPassword ? 'eye-off-outline' : 'eye-outline'}
              size={20}
              color="#94a3b8"
            />
          </TouchableOpacity>
        </View>
      </View>

      {/* Password validation checklist — register mode, matching web */}
      {mode === 'register' && (
        <View style={styles.passwordChecklist}>
          <Text style={styles.checklistTitle}>
            Votre mot de passe doit contenir :
          </Text>
          <Text
            style={[
              styles.checklistItem,
              password.length >= 6 && styles.checklistItemValid,
            ]}
          >
            • Au moins 6 caractères
          </Text>
          <Text
            style={[
              styles.checklistItem,
              /[A-Z]/.test(password) && styles.checklistItemValid,
            ]}
          >
            • Au moins 1 majuscule
          </Text>
          <Text
            style={[
              styles.checklistItem,
              /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password) &&
                styles.checklistItemValid,
            ]}
          >
            • Au moins 1 caractère spécial (!@#$%...)
          </Text>
        </View>
      )}

      {mode === 'register' && passwordWarning ? (
        <Text style={styles.warningText}>{passwordWarning}</Text>
      ) : null}

      {/* CGU checkbox — register only, matching web */}
      {mode === 'register' && (
        <View style={styles.termsContainer}>
          <TouchableOpacity
            style={styles.termsRow}
            onPress={() => setAcceptedTerms((v) => !v)}
            activeOpacity={0.8}
          >
            <View
              style={[
                styles.checkbox,
                acceptedTerms && styles.checkboxChecked,
              ]}
            >
              {acceptedTerms && (
                <Ionicons name="checkmark" size={12} color="#fff" />
              )}
            </View>
            <Text style={styles.termsText}>
              J'accepte les{' '}
              <Text style={styles.linkText}>
                Conditions Générales d'Utilisation
              </Text>{' '}
              et la{' '}
              <Text style={styles.linkText}>
                Politique de confidentialité
              </Text>
              . Je reconnais que mes données seront traitées conformément au
              RGPD (stockage sécurisé sur Azure Europe).
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Submit */}
      <Button
        label={mode === 'login' ? 'Se connecter' : "S'inscrire"}
        onPress={handleSubmit}
        loading={isLoading}
        disabled={mode === 'register' && !acceptedTerms}
      />
    </View>
  );

  const renderForm = () => {
    switch (mode) {
      case 'forgot':
        return renderForgot();
      case 'email-sent':
        return renderEmailSent();
      case 'reset':
        return renderReset();
      default:
        return renderLoginRegister();
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        {/* Logo + subtitle — matches web header */}
        <View style={styles.header}>
          <View style={styles.logoCircle}>
            <Ionicons name="shield-checkmark" size={36} color="#0ea5e9" />
          </View>
          <Text style={styles.subtitle}>
            Votre assistant d'assurance personnel intelligent
          </Text>
        </View>

        {/* White card — matches web: bg-white, shadow-xl, rounded-2xl, border */}
        <View style={styles.card}>
          {error ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}
          {success ? (
            <View style={styles.successBox}>
              <Text style={styles.successText}>{success}</Text>
            </View>
          ) : null}

          {renderForm()}

          {/* Footer — RGPD + disclaimer, matching web */}
          <View style={styles.footer}>
            <Text style={styles.rgpdText}>
              Vos données sont hébergées sur Azure Europe (conforme RGPD)
            </Text>
            <View style={styles.disclaimerBox}>
              <Text style={styles.disclaimerText}>
                ⚠️ <Text style={styles.bold}>Disclaimer :</Text> BienCouvert
                est un outil d'aide à la décision. Les analyses et
                recommandations générées par l'IA sont fournies à titre
                informatif uniquement et ne sont pas vérifiées par un
                professionnel. Elles ne constituent pas des conseils en assurance
                au sens légal. Consultez un courtier ou assureur agréé pour toute
                décision importante.
              </Text>
            </View>
          </View>
        </View>
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
  /* Header */
  header: {
    alignItems: 'center',
    marginBottom: 32,
  },
  logoCircle: {
    width: 72,
    height: 72,
    borderRadius: 20,
    backgroundColor: '#e0f2fe',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 14,
    color: '#64748b',
    marginTop: 4,
  },
  /* Card */
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    paddingVertical: 32,
    paddingHorizontal: 20,
    borderWidth: 1,
    borderColor: '#f1f5f9',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 8,
  },
  /* Form */
  formSection: {
    gap: 16,
  },
  /* Tabs */
  tabs: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    marginBottom: 8,
  },
  tab: {
    flex: 1,
    paddingBottom: 14,
    alignItems: 'center',
    position: 'relative',
  },
  tabText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#64748b',
  },
  tabTextActive: {
    color: '#0ea5e9',
    fontWeight: '700',
  },
  tabUnderline: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: '#0ea5e9',
    borderRadius: 1,
  },
  /* Inputs */
  inputLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#334155',
    marginBottom: 4,
  },
  passwordHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  forgotLink: {
    fontSize: 12,
    color: '#0ea5e9',
    fontWeight: '600',
  },
  passwordRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  eyeBtn: {
    paddingBottom: 12,
    paddingHorizontal: 4,
  },
  /* Mode description */
  modeDescription: {
    fontSize: 14,
    color: '#475569',
    lineHeight: 20,
  },
  /* Password checklist */
  passwordChecklist: {
    gap: 2,
  },
  checklistTitle: {
    fontSize: 12,
    fontWeight: '500',
    color: '#475569',
    marginBottom: 2,
  },
  checklistItem: {
    fontSize: 12,
    color: '#475569',
    marginLeft: 16,
  },
  checklistItemValid: {
    color: '#16a34a',
  },
  /* Warning */
  warningText: {
    fontSize: 12,
    color: '#ea580c',
    fontWeight: '500',
  },
  /* Terms / CGU */
  termsContainer: {
    backgroundColor: '#f8fafc',
    padding: 16,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  termsRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: '#0ea5e9',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  checkboxChecked: {
    backgroundColor: '#0ea5e9',
  },
  termsText: {
    fontSize: 12,
    color: '#334155',
    flex: 1,
    lineHeight: 18,
  },
  /* Alerts */
  errorBox: {
    backgroundColor: '#fef2f2',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#fecaca',
    marginBottom: 8,
  },
  errorText: {
    color: '#b91c1c',
    fontSize: 13,
  },
  successBox: {
    backgroundColor: '#ecfdf5',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#a7f3d0',
    marginBottom: 8,
  },
  successText: {
    color: '#065f46',
    fontSize: 13,
  },
  /* Email-sent */
  emailSentContainer: {
    alignItems: 'center',
    gap: 12,
    paddingVertical: 16,
  },
  emailSentIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#ecfdf5',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  emailSentTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0f172a',
  },
  emailSentText: {
    fontSize: 14,
    color: '#475569',
    textAlign: 'center',
    lineHeight: 20,
  },
  /* Back link */
  backLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 4,
  },
  backLinkText: {
    color: '#64748b',
    fontSize: 14,
  },
  /* Links */
  linkText: {
    color: '#0ea5e9',
    fontWeight: '600',
  },
  bold: {
    fontWeight: '700',
  },
  /* Footer */
  footer: {
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    marginTop: 24,
    paddingTop: 16,
    gap: 12,
  },
  rgpdText: {
    fontSize: 12,
    color: '#94a3b8',
    textAlign: 'center',
  },
  disclaimerBox: {
    backgroundColor: '#fffbeb',
    borderWidth: 1,
    borderColor: '#fde68a',
    borderRadius: 10,
    padding: 12,
  },
  disclaimerText: {
    fontSize: 12,
    color: '#78350f',
    lineHeight: 18,
  },
});
