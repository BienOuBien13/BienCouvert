// components/UserProfile.tsx — Profil utilisateur adapté RN
// Adapté depuis FrontEnd/components/UserProfile.tsx

import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Input } from './ui/Input';
import { Button } from './ui/Button';
import { Card } from './ui/Card';
import { User, UserProfileData } from '../types';
import { authService } from '../services/authService';
import { initials } from '../utils/formatters';

interface Props {
  user: User;
  onUpdateUser: (user: User) => void;
  onLogout: () => void;
}

export function UserProfile({ user, onUpdateUser, onLogout }: Props) {
  const [firstName, setFirstName] = useState(user.firstName);
  const [lastName, setLastName] = useState(user.lastName);
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  const handleSave = async () => {
    setStatus('saving');
    setErrorMsg('');
    try {
      const updated = await authService.updateUser(user.id, {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        password: password || undefined,
      });
      onUpdateUser(updated);
      setPassword('');
      setStatus('success');
      setTimeout(() => setStatus('idle'), 3000);
    } catch (e: any) {
      setErrorMsg(e.message || 'Erreur lors de la mise à jour.');
      setStatus('error');
    }
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      'Supprimer le compte ?',
      'Cette action est irréversible. Toutes vos données seront supprimées définitivement.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer mon compte',
          style: 'destructive',
          onPress: async () => {
            try {
              await authService.deleteAccount(user.id);
              onLogout();
            } catch (e: any) {
              Alert.alert('Erreur', e.message);
            }
          },
        },
      ],
    );
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView style={styles.flex} contentContainerStyle={styles.container}>
        {/* Header */}
        <View style={styles.headerCard}>
          <View style={styles.avatarCircle}>
            <Text style={styles.avatarText}>{initials(user.firstName, user.lastName)}</Text>
          </View>
          <View>
            <Text style={styles.userName}>{user.firstName} {user.lastName}</Text>
            <Text style={styles.userEmail}>{user.email}</Text>
            {user.isAdmin && (
              <View style={styles.adminBadge}>
                <Text style={styles.adminBadgeText}>Administrateur</Text>
              </View>
            )}
          </View>
        </View>

        {/* Formulaire */}
        <Card elevated style={styles.formCard}>
          <Text style={styles.sectionTitle}>Informations personnelles</Text>

          {status === 'error' && (
            <View style={styles.errorBox}>
              <Ionicons name="alert-circle-outline" size={16} color="#b91c1c" />
              <Text style={styles.errorText}>{errorMsg}</Text>
            </View>
          )}

          {status === 'success' && (
            <View style={styles.successBox}>
              <Ionicons name="checkmark-circle-outline" size={16} color="#15803d" />
              <Text style={styles.successText}>Profil mis à jour avec succès.</Text>
            </View>
          )}

          <View style={styles.form}>
            <Input label="Prénom" value={firstName} onChangeText={setFirstName} />
            <Input label="Nom" value={lastName} onChangeText={setLastName} />
            <Input
              label="Nouveau mot de passe (optionnel)"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              placeholder="Laisser vide pour ne pas changer"
            />
          </View>

          <Button
            label="Enregistrer les modifications"
            onPress={handleSave}
            loading={status === 'saving'}
            style={styles.saveBtn}
          />
        </Card>

        {/* Déconnexion */}
        <Card style={styles.actionCard}>
          <TouchableOpacity style={styles.actionRow} onPress={onLogout}>
            <Ionicons name="log-out-outline" size={20} color="#f59e0b" />
            <Text style={styles.actionLogout}>Se déconnecter</Text>
          </TouchableOpacity>
          <View style={styles.divider} />
          <TouchableOpacity style={styles.actionRow} onPress={handleDeleteAccount}>
            <Ionicons name="trash-outline" size={20} color="#ef4444" />
            <Text style={styles.actionDelete}>Supprimer mon compte</Text>
          </TouchableOpacity>
        </Card>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#f8fafc' },
  container: { padding: 16, paddingBottom: 40, gap: 16 },
  headerCard: {
    backgroundColor: '#0f172a',
    borderRadius: 20,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  avatarCircle: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: '#0ea5e9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 22, fontWeight: '800', color: '#fff' },
  userName: { fontSize: 18, fontWeight: '800', color: '#fff' },
  userEmail: { fontSize: 13, color: '#94a3b8', marginTop: 2 },
  adminBadge: {
    backgroundColor: '#7c3aed',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  adminBadgeText: { fontSize: 11, color: '#fff', fontWeight: '700' },
  formCard: { gap: 16 },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: '#0f172a' },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#fef2f2',
    borderRadius: 8,
    padding: 10,
  },
  errorText: { color: '#b91c1c', fontSize: 13, flex: 1 },
  successBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#f0fdf4',
    borderRadius: 8,
    padding: 10,
  },
  successText: { color: '#15803d', fontSize: 13, flex: 1 },
  form: { gap: 12 },
  saveBtn: { marginTop: 4 },
  actionCard: { gap: 4 },
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  actionLogout: { fontSize: 15, fontWeight: '600', color: '#f59e0b' },
  actionDelete: { fontSize: 15, fontWeight: '600', color: '#ef4444' },
  divider: { height: 1, backgroundColor: '#f1f5f9' },
});
