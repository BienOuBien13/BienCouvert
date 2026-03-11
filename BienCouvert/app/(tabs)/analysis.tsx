// app/(tabs)/analysis.tsx — Écran d'analyse du portefeuille
import React, { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';

import { useAuth } from '@/hooks/useAuth';
import { usePolicies } from '@/hooks/usePolicies';
import { AnalysisView } from '@/components/AnalysisView';

export default function AnalysisScreen() {
  const { user } = useAuth();
  const { policies, load } = usePolicies(user?.id);

  useEffect(() => { load(); }, [load]);

  if (!user) return null;

  return (
    <View style={styles.flex}>
      <AnalysisView
        policies={policies}
        profile={user.profile || {}}
        user={user}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
});
