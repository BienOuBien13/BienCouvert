// app/(tabs)/admin.tsx — Dashboard de monitoring des connexions utilisateurs
import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  FlatList,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, type Href } from 'expo-router';

import { useAuth } from '@/hooks/useAuth';
import {
  adminService,
  DashboardStats,
  AdminUser,
  ConnectionLog,
} from '@/services/adminService';

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const ACTION_META: Record<ConnectionLog['action'], { label: string; color: string; icon: React.ComponentProps<typeof Ionicons>['name'] }> = {
  USER_LOGIN:        { label: 'Connexion',    color: '#22c55e', icon: 'log-in-outline' },
  USER_LOGOUT:       { label: 'Déconnexion',  color: '#94a3b8', icon: 'log-out-outline' },
  USER_FAILED_LOGIN: { label: 'Échec login',  color: '#ef4444', icon: 'warning-outline' },
  USER_REGISTER:     { label: 'Inscription',  color: '#0ea5e9', icon: 'person-add-outline' },
};

// ─── Composants ─────────────────────────────────────────────────────────────

function StatCard({ label, value, icon, color }: {
  label: string; value: string | number; icon: React.ComponentProps<typeof Ionicons>['name']; color: string;
}) {
  return (
    <View style={[styles.statCard, { borderLeftColor: color }]}>
      <Ionicons name={icon} size={22} color={color} style={styles.statIcon} />
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function LogItem({ item }: { item: ConnectionLog }) {
  const meta = ACTION_META[item.action] ?? { label: item.action, color: '#64748b', icon: 'ellipse-outline' as const };
  const name = item.first_name
    ? `${item.first_name} ${item.last_name ?? ''}`.trim()
    : item.user_email ?? 'Inconnu';

  return (
    <View style={styles.logRow}>
      <View style={[styles.logDot, { backgroundColor: meta.color }]} />
      <View style={styles.logContent}>
        <View style={styles.logHeader}>
          <Text style={styles.logName} numberOfLines={1}>{name}</Text>
          <Text style={[styles.logBadge, { color: meta.color }]}>{meta.label}</Text>
        </View>
        <Text style={styles.logSub}>{item.user_email ?? '—'}  ·  {item.ip_address ?? '—'}</Text>
        <Text style={styles.logTime}>{formatDate(item.timestamp)}</Text>
      </View>
    </View>
  );
}

function UserRow({ item }: { item: AdminUser }) {
  return (
    <View style={styles.userRow}>
      <View style={styles.userAvatar}>
        <Text style={styles.userAvatarText}>
          {(item.first_name?.[0] ?? item.email[0]).toUpperCase()}
        </Text>
      </View>
      <View style={styles.userInfo}>
        <View style={styles.userHeaderRow}>
          <Text style={styles.userName} numberOfLines={1}>
            {item.first_name} {item.last_name}
          </Text>
          {item.is_admin && (
            <View style={styles.adminBadge}>
              <Text style={styles.adminBadgeText}>Admin</Text>
            </View>
          )}
        </View>
        <Text style={styles.userEmail} numberOfLines={1}>{item.email}</Text>
        <Text style={styles.userMeta}>
          {item.policy_count} contrat{item.policy_count !== 1 ? 's' : ''}  ·  Inscrit {formatDate(item.created_at)}
        </Text>
        <Text style={styles.userLastLogin}>
          Dernière connexion : {formatDate(item.last_login)}
        </Text>
      </View>
    </View>
  );
}

// ─── Écran principal ─────────────────────────────────────────────────────────

type Tab = 'dashboard' | 'users' | 'logs';

export default function AdminScreen() {
  const { user } = useAuth();

  const [activeTab, setActiveTab] = useState<Tab>('dashboard');
  const [stats, setStats]         = useState<DashboardStats | null>(null);
  const [users, setUsers]         = useState<AdminUser[]>([]);
  const [logs, setLogs]           = useState<ConnectionLog[]>([]);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState<string | null>(null);

  // Guard : non-admin redirigé vers l'accueil
  useEffect(() => {
    if (user && !user.isAdmin) {
      router.replace('/(tabs)/' as Href);
    }
  }, [user]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [s, u, l] = await Promise.all([
        adminService.getDashboardStats(),
        adminService.getUsers(),
        adminService.getConnectionLogs(100),
      ]);
      setStats(s);
      setUsers(u);
      setLogs(l);
    } catch (e: any) {
      setError(e.message ?? 'Erreur de chargement');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (!user?.isAdmin) return null;

  const tabs: { key: Tab; label: string; icon: React.ComponentProps<typeof Ionicons>['name'] }[] = [
    { key: 'dashboard', label: 'Vue globale', icon: 'grid-outline' },
    { key: 'users',     label: 'Utilisateurs', icon: 'people-outline' },
    { key: 'logs',      label: 'Connexions',  icon: 'list-outline' },
  ];

  return (
    <View style={styles.screen}>
      {/* Sous-onglets internes */}
      <View style={styles.tabBar}>
        {tabs.map(t => (
          <TouchableOpacity
            key={t.key}
            style={[styles.tab, activeTab === t.key && styles.tabActive]}
            onPress={() => setActiveTab(t.key)}
          >
            <Ionicons name={t.icon} size={16} color={activeTab === t.key ? '#0ea5e9' : '#94a3b8'} />
            <Text style={[styles.tabLabel, activeTab === t.key && styles.tabLabelActive]}>
              {t.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading && !stats ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#0ea5e9" />
          <Text style={styles.loadingText}>Chargement…</Text>
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Ionicons name="alert-circle-outline" size={40} color="#ef4444" />
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={load}>
            <Text style={styles.retryText}>Réessayer</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scroll}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor="#0ea5e9" />}
        >
          {/* ── Dashboard ── */}
          {activeTab === 'dashboard' && stats && (
            <>
              <Text style={styles.sectionTitle}>Statistiques globales</Text>
              <View style={styles.statsGrid}>
                <StatCard label="Utilisateurs" value={stats.total_users}         icon="people-outline"       color="#0ea5e9" />
                <StatCard label="Nouveaux (7j)" value={stats.new_users_week}     icon="person-add-outline"   color="#8b5cf6" />
                <StatCard label="Connexions aujourd'hui" value={stats.logins_today}   icon="log-in-outline"  color="#22c55e" />
                <StatCard label="Échecs aujourd'hui" value={stats.failed_logins_today} icon="warning-outline" color="#ef4444" />
                <StatCard label="Connexions (7j)" value={stats.logins_week}      icon="trending-up-outline"  color="#f59e0b" />
                <StatCard label="Actifs (30j)" value={stats.active_users_month}  icon="pulse-outline"        color="#06b6d4" />
              </View>

              <Text style={styles.sectionTitle}>Dernières connexions</Text>
              {logs.slice(0, 10).map(l => <LogItem key={l.id} item={l} />)}
            </>
          )}

          {/* ── Utilisateurs ── */}
          {activeTab === 'users' && (
            <>
              <Text style={styles.sectionTitle}>{users.length} utilisateur{users.length !== 1 ? 's' : ''}</Text>
              {users.map(u => <UserRow key={u.id} item={u} />)}
            </>
          )}

          {/* ── Logs ── */}
          {activeTab === 'logs' && (
            <>
              <Text style={styles.sectionTitle}>{logs.length} événement{logs.length !== 1 ? 's' : ''}</Text>
              {logs.map(l => <LogItem key={l.id} item={l} />)}
            </>
          )}
        </ScrollView>
      )}
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen:        { flex: 1, backgroundColor: '#f8fafc' },

  // Tabs internes
  tabBar:        { flexDirection: 'row', backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  tab:           { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 12, gap: 5 },
  tabActive:     { borderBottomWidth: 2, borderBottomColor: '#0ea5e9' },
  tabLabel:      { fontSize: 12, fontWeight: '600', color: '#94a3b8' },
  tabLabelActive:{ color: '#0ea5e9' },

  // Contenu
  scroll:        { padding: 16, paddingBottom: 32 },
  sectionTitle:  { fontSize: 13, fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 16, marginBottom: 10 },

  // Stats
  statsGrid:     { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  statCard:      {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    borderLeftWidth: 3,
    width: '47%',
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  statIcon:      { marginBottom: 6 },
  statValue:     { fontSize: 24, fontWeight: '800', color: '#0f172a' },
  statLabel:     { fontSize: 11, color: '#94a3b8', fontWeight: '500', marginTop: 2 },

  // Log rows
  logRow:        { flexDirection: 'row', backgroundColor: '#fff', borderRadius: 10, marginBottom: 8, padding: 12, alignItems: 'flex-start', shadowColor: '#000', shadowOpacity: 0.03, elevation: 1 },
  logDot:        { width: 8, height: 8, borderRadius: 4, marginTop: 5, marginRight: 10 },
  logContent:    { flex: 1 },
  logHeader:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 },
  logName:       { fontSize: 14, fontWeight: '700', color: '#0f172a', flex: 1 },
  logBadge:      { fontSize: 11, fontWeight: '700', marginLeft: 8 },
  logSub:        { fontSize: 12, color: '#64748b', marginBottom: 2 },
  logTime:       { fontSize: 11, color: '#94a3b8' },

  // User rows
  userRow:       { flexDirection: 'row', backgroundColor: '#fff', borderRadius: 12, marginBottom: 8, padding: 12, alignItems: 'flex-start', shadowColor: '#000', shadowOpacity: 0.04, elevation: 1 },
  userAvatar:    { width: 40, height: 40, borderRadius: 20, backgroundColor: '#e0f2fe', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  userAvatarText:{ fontSize: 16, fontWeight: '800', color: '#0ea5e9' },
  userInfo:      { flex: 1 },
  userHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 },
  userName:      { fontSize: 14, fontWeight: '700', color: '#0f172a', flex: 1 },
  adminBadge:    { backgroundColor: '#fef3c7', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  adminBadgeText:{ fontSize: 10, fontWeight: '700', color: '#d97706' },
  userEmail:     { fontSize: 12, color: '#64748b', marginBottom: 2 },
  userMeta:      { fontSize: 11, color: '#94a3b8' },
  userLastLogin: { fontSize: 11, color: '#94a3b8', marginTop: 1 },

  // États
  center:        { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText:   { color: '#64748b', marginTop: 8 },
  errorText:     { color: '#ef4444', textAlign: 'center', paddingHorizontal: 24 },
  retryBtn:      { backgroundColor: '#0ea5e9', borderRadius: 10, paddingHorizontal: 20, paddingVertical: 10 },
  retryText:     { color: '#fff', fontWeight: '700' },
});
