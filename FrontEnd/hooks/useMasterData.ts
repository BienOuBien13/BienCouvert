// hooks/useMasterData.ts
// Hook React pour charger les master data avec cache

import { useState, useEffect } from 'react';
import { getInsuranceTypes, getInsurers, type InsuranceType, type Insurer } from '../services/masterDataService';

// Cache global pour éviter les appels répétés
let cachedInsuranceTypes: InsuranceType[] | null = null;
let cachedInsurers: Insurer[] | null = null;

/**
 * Hook pour charger les types d'assurance
 */
export function useInsuranceTypes() {
  const [types, setTypes] = useState<InsuranceType[]>(cachedInsuranceTypes || []);
  const [loading, setLoading] = useState(!cachedInsuranceTypes);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (cachedInsuranceTypes) {
      setTypes(cachedInsuranceTypes);
      setLoading(false);
      return;
    }

    let isMounted = true;

    getInsuranceTypes()
      .then(data => {
        if (isMounted) {
          cachedInsuranceTypes = data;
          setTypes(data);
          setLoading(false);
        }
      })
      .catch(err => {
        if (isMounted) {
          setError(err);
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  return { types, loading, error };
}

/**
 * Hook pour charger les assureurs
 */
export function useInsurers() {
  const [insurers, setInsurers] = useState<Insurer[]>(cachedInsurers || []);
  const [loading, setLoading] = useState(!cachedInsurers);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (cachedInsurers) {
      setInsurers(cachedInsurers);
      setLoading(false);
      return;
    }

    let isMounted = true;

    getInsurers()
      .then(data => {
        if (isMounted) {
          cachedInsurers = data;
          setInsurers(data);
          setLoading(false);
        }
      })
      .catch(err => {
        if (isMounted) {
          setError(err);
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  return { insurers, loading, error };
}

/**
 * Hook pour charger les deux ensembles de données
 */
export function useMasterData() {
  const insuranceTypes = useInsuranceTypes();
  const insurers = useInsurers();

  return {
    types: insuranceTypes.types,
    insurers: insurers.insurers,
    loading: insuranceTypes.loading || insurers.loading,
    error: insuranceTypes.error || insurers.error,
  };
}
