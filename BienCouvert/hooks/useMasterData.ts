// hooks/useMasterData.ts — Données de référence avec cache
// Adapté depuis FrontEnd/hooks/useMasterData.ts

import { useState, useEffect } from 'react';
import { getInsuranceTypes, getInsurers, type InsuranceType, type Insurer } from '../services/masterDataService';

// Cache en mémoire pour éviter des appels réseau répétés
let cachedTypes: InsuranceType[] | null = null;
let cachedInsurers: Insurer[] | null = null;

export function useInsuranceTypes() {
  const [types, setTypes] = useState<InsuranceType[]>(cachedTypes || []);
  const [loading, setLoading] = useState(!cachedTypes);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (cachedTypes) { setTypes(cachedTypes); setLoading(false); return; }
    let active = true;
    getInsuranceTypes()
      .then(data => { if (active) { cachedTypes = data; setTypes(data); setLoading(false); } })
      .catch(err => { if (active) { setError(err); setLoading(false); } });
    return () => { active = false; };
  }, []);

  return { types, loading, error };
}

export function useInsurers() {
  const [insurers, setInsurers] = useState<Insurer[]>(cachedInsurers || []);
  const [loading, setLoading] = useState(!cachedInsurers);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (cachedInsurers) { setInsurers(cachedInsurers); setLoading(false); return; }
    let active = true;
    getInsurers()
      .then(data => { if (active) { cachedInsurers = data; setInsurers(data); setLoading(false); } })
      .catch(err => { if (active) { setError(err); setLoading(false); } });
    return () => { active = false; };
  }, []);

  return { insurers, loading, error };
}
