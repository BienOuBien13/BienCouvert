import React from 'react';
import { Tabs } from 'expo-router';
import { TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, type Href } from 'expo-router';

import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { useClientOnlyValue } from '@/components/useClientOnlyValue';
import { useAuth } from '@/hooks/useAuth';

function TabIcon({ name, color }: { name: React.ComponentProps<typeof Ionicons>['name']; color: string }) {
  return <Ionicons name={name} size={24} color={color} />;
}

function AdminHeaderButton() {
  return (
    <TouchableOpacity
      onPress={() => router.push('/(tabs)/admin' as Href)}
      style={{ marginRight: 16 }}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
    >
      <Ionicons name="shield-checkmark-outline" size={24} color="#f59e0b" />
    </TouchableOpacity>
  );
}

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const { user } = useAuth();

  const adminHeaderRight = user?.isAdmin ? () => <AdminHeaderButton /> : undefined;

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#0ea5e9',
        tabBarInactiveTintColor: '#94a3b8',
        tabBarStyle: {
          backgroundColor: '#fff',
          borderTopColor: '#f1f5f9',
          elevation: 0,
          shadowOpacity: 0,
          height: 60,
          paddingBottom: 8,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        headerStyle: { backgroundColor: '#fff', elevation: 0, shadowOpacity: 0 },
        headerTitleStyle: { fontWeight: '800', fontSize: 18, color: '#0f172a' },
        headerShown: useClientOnlyValue(false, true),
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Contrats',
          tabBarIcon: ({ color }) => <TabIcon name="shield-outline" color={color} />,
          headerRight: adminHeaderRight,
        }}
      />
      <Tabs.Screen
        name="add"
        options={{
          title: 'Ajouter',
          tabBarIcon: ({ color }) => <TabIcon name="add-circle-outline" color={color} />,
          headerRight: adminHeaderRight,
        }}
      />
      <Tabs.Screen
        name="chat"
        options={{
          title: 'Assistant',
          tabBarIcon: ({ color }) => <TabIcon name="chatbubbles-outline" color={color} />,
          headerRight: adminHeaderRight,
        }}
      />
      <Tabs.Screen
        name="analysis"
        options={{
          title: 'Analyse',
          tabBarIcon: ({ color }) => <TabIcon name="sparkles-outline" color={color} />,
          headerRight: adminHeaderRight,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profil',
          tabBarIcon: ({ color }) => <TabIcon name="person-outline" color={color} />,
          headerRight: adminHeaderRight,
        }}
      />
      <Tabs.Screen
        name="admin"
        options={{
          title: 'Monitoring',
          href: user?.isAdmin ? undefined : null,
          tabBarIcon: ({ color }) => <TabIcon name="shield-checkmark-outline" color={color} />,
          tabBarActiveTintColor: '#f59e0b',
        }}
      />
    </Tabs>
  );
}
