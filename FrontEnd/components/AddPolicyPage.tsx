/**
 * Page d'ajout de contrat d'assurance - Interface visuelle améliorée
 * 2 modes : CG standards (depuis central_cg) ou CG personnalisées (upload PDF)
 */

import React, { useState, useEffect, useRef } from 'react';
import { Car, Home, Heart, Briefcase, ShieldPlus, Upload, Check, X, AlertCircle, FileText, Link as LinkIcon, Package, Scale, Smartphone, Shield, CreditCard, Search } from 'lucide-react';
import { getInsuranceSubTypes, getInsuranceTypes as fetchInsuranceTypes, type InsuranceSubType } from '../services/masterDataService';
import { API_URL } from '../services/apiUrl';

interface InsuranceType {
  code: string;
  labelFr: string;
  icon: string;
  color: string;
}

interface Insurer {
  code: string;
  label: string;
  fullName: string;
  color: string;
  logoUrl?: string;   // URL du logo depuis la table insurers.logo_url
}

interface CGData {
  id: number;
  url?: string;
  formules: string[];
  options: {
    [key: string]: string[];
  };
  resume_court: string;
  insurer_name: string;
  insurance_type_name: string;
}

// Icônes Lucide de secours (si l'image PNG n'est pas disponible)
const insuranceIconsFallback: Record<string, React.FC<any>> = {
  AUT: Car, AUT01: Car,
  HAB: Home, HAB01: Home,
  SAN: Heart, SAN01: Heart,
  PRE: Heart, PRE01: Heart,
  PRO: Briefcase,
  DEFAULT: ShieldPlus
};

// Mapping nom icône API → composant Lucide
const LUCIDE_ICON_MAP: Record<string, React.FC<any>> = {
  Car, Home, Heart, Shield, Briefcase, CreditCard, Smartphone, Scale, Package,
  ShieldPlus, Sport: ShieldPlus,
};

interface AddPolicyPageProps {
  onCancel?: () => void;
  onAdd?: (policy: any) => void;
}

const AddPolicyPage: React.FC<AddPolicyPageProps> = ({ onCancel, onAdd }) => {
  const [mode, setMode] = useState<'standard' | 'custom'>('standard');
  const [step, setStep] = useState<'selectType' | 'selectInsurer' | 'selectSubType' | 'customConfig' | 'configure'>('selectType');
  // true = aucune CG trouvée dans le référentiel, saisie manuelle de la formule
  const [isNoCgMode, setIsNoCgMode] = useState(false);
  
  // Master data
  const [insuranceTypes, setInsuranceTypes] = useState<InsuranceType[]>([]);
  const [availableInsurers, setAvailableInsurers] = useState<Insurer[]>([]);
  
  // Sélection
  const [selectedType, setSelectedType] = useState<InsuranceType | null>(null);
  const [selectedInsurer, setSelectedInsurer] = useState<Insurer | null>(null);
  const [cgData, setCgData] = useState<CGData | null>(null);
  const [selectedFormule, setSelectedFormule] = useState('');
  const [selectedOptions, setSelectedOptions] = useState<string[]>([]);
  const [policyName, setPolicyName] = useState('');
  
  // Formulaire personnalisé
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [contractVersion, setContractVersion] = useState('001');
  const [docType, setDocType] = useState('CG');
  const [contractUrl, setContractUrl] = useState('');
  const [selectedSubTypeCode, setSelectedSubTypeCode] = useState('');       // custom mode
  const [availableSubTypes, setAvailableSubTypes] = useState<InsuranceSubType[]>([]);
  const [isLoadingSubTypes, setIsLoadingSubTypes] = useState(false);
  // Sous-types mode standard (multi-select : 1 ligne de portefeuille par sous-type)
  const [availableSubTypesStandard, setAvailableSubTypesStandard] = useState<{ code: string; labelFr: string }[]>([]);
  const [selectedSubTypeCodes, setSelectedSubTypeCodes] = useState<string[]>([]);
  const [isLoadingSubTypesStandard, setIsLoadingSubTypesStandard] = useState(false);
  // Progression traitement async
  const [processingPercent, setProcessingPercent] = useState(0);
  const [processingPhase, setProcessingPhase] = useState('');
  const pollAbortRef = useRef(false);
  
  // État général
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [insurerSearch, setInsurerSearch] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [userId, setUserId] = useState('');
  // Consentement au partage communautaire du PDF
  const [shareConsent, setShareConsent] = useState(false);

  useEffect(() => {
    loadInsuranceTypes();
    loadUserData();
  }, []);

  const loadUserData = () => {
    const user = localStorage.getItem('assurclair_current_user');
    if (user) {
      const userData = JSON.parse(user);
      setUserEmail(userData.email);
      setUserId(userData.id || userData.user_id || '');
    }
  };

  const loadInsuranceTypes = async () => {
    try {
      // Use the centralised service (includes credentials + fallback on error)
      const data = await fetchInsuranceTypes();
      setInsuranceTypes(data as any[]);
    } catch (err) {
      console.error('Erreur chargement types:', err);
      setError('Impossible de charger les types d\'assurance');
    }
  };

  const loadInsurersByType = async (typeCode: string, currentMode: 'standard' | 'custom' = mode) => {
    try {
      // Mode standard : uniquement les assureurs qui ont une CG active dans central_cg
      // Mode custom : tous les assureurs du référentiel + option "Autre"
      const url = currentMode === 'standard'
        ? `${API_URL}/api/cg/central/available-insurers?insurance_type_code=${encodeURIComponent(typeCode)}`
        : `${API_URL}/api/masterdata/insurers-by-type/${typeCode}`;
      const response = await fetch(url, { credentials: 'include' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      const insurers = Array.isArray(data) ? data : [];
      if (currentMode === 'custom') {
        // Ajouter l'option "Autre" en fin de liste
        const autreAlreadyPresent = insurers.some((i: Insurer) => i.code === 'AUTRE');
        if (!autreAlreadyPresent) {
          insurers.push({ code: 'AUTRE', label: 'Autre', fullName: 'Autre assureur', color: '#6B7280', logoUrl: undefined });
        }
      }
      setAvailableInsurers(insurers);
    } catch (err) {
      console.error('Erreur chargement assureurs:', err);
      setError('Impossible de charger les assureurs');
    }
  };

  const handleSelectType = async (type: InsuranceType) => {
    setSelectedType(type);
    setError('');
    await loadInsurersByType(type.code, mode);
    setStep('selectInsurer');
  };

  const handleSelectInsurer = async (insurer: Insurer) => {
    setSelectedInsurer(insurer);
    
    if (mode === 'standard') {
      // Vérifier si plusieurs sous-types sont disponibles pour cet assureur + type
      setIsLoadingSubTypesStandard(true);
      try {
        const subTypesRes = await fetch(
          `${API_URL}/api/cg/central/available-sub-types?insurance_type_code=${encodeURIComponent(selectedType!.code)}&insurer_code=${encodeURIComponent(insurer.code)}`,
          { credentials: 'include' }
        );
        const subTypes: { code: string; labelFr: string }[] = subTypesRes.ok ? await subTypesRes.json() : [];
        if (subTypes.length >= 2) {
          // Plusieurs sous-types → étape de sélection
          setAvailableSubTypesStandard(subTypes);
          setSelectedSubTypeCodes([]);
          setPolicyName(`${selectedType!.labelFr} - ${insurer.label}`);
          setStep('selectSubType');
        } else {
          // 0 ou 1 sous-type → flux normal
          const firstSubType = subTypes[0]?.code || null;
          setSelectedSubTypeCodes(firstSubType ? [firstSubType] : []);
          await searchCG(selectedType!.code, insurer.code, insurer, firstSubType);
        }
      } catch {
        await searchCG(selectedType!.code, insurer.code, insurer, null);
      } finally {
        setIsLoadingSubTypesStandard(false);
      }
    } else {
      // Custom mode → charger les sous-types et passer au formulaire
      setPolicyName(`${selectedType!.labelFr} - ${insurer.label}`);
      setSelectedSubTypeCode('');
      setIsLoadingSubTypes(true);
      getInsuranceSubTypes(selectedType!.code)
        .then(setAvailableSubTypes)
        .finally(() => setIsLoadingSubTypes(false));
      setStep('customConfig');
    }
  };

  // Mode standard : recherche des CG disponibles
  const searchCG = async (typeCode: string, insurerCode: string, insurer: Insurer, subTypeCode?: string | null) => {
    setLoading(true);
    setError('');
    setIsNoCgMode(false);

    try {
      const url = `${API_URL}/api/cg/central/by-type-and-insurer?insurance_type_code=${encodeURIComponent(typeCode)}&insurer_code=${encodeURIComponent(insurerCode)}`
        + (subTypeCode ? `&insurance_sub_type_code=${encodeURIComponent(subTypeCode)}` : '');
      
      const response = await fetch(url, { credentials: 'include' });
      
      if (!response.ok) {
        if (response.status === 404) {
          // Aucune CG trouvée — mode dégradé : saisie manuelle de formule
          setIsNoCgMode(true);
          setCgData({ id: null as any, formules: [], options: {}, resume_court: '', insurer_name: insurer.label, insurance_type_name: selectedType?.labelFr || '' });
          setPolicyName(`${selectedType?.labelFr || typeCode} - ${insurer.label}`);
          setStep('configure');
          return;
        }
        throw new Error('API_ERROR');
      }
      
      const data = await response.json();
      setCgData(data);
      setIsNoCgMode(false);
      setPolicyName(`${selectedType!.labelFr} - ${insurer.label}`);
      setStep('configure');
    } catch (err: any) {
      if (err.message !== 'API_ERROR') throw err;
      setError('Erreur lors de la recherche des conditions générales. Essayez le mode "CG Personnalisées".');
    } finally {
      setLoading(false);
    }
  };

  // Mode personnalisé : upload PDF + polling de progression
  const cancelPolling = () => {
    pollAbortRef.current = true;
    setIsUploading(false);
    setProcessingPercent(0);
    setProcessingPhase('');
  };

  const uploadCustomCG = async () => {
    if (!pdfFile || !selectedType || !selectedInsurer) {
      setError('Veuillez sélectionner un fichier PDF');
      return;
    }
    if (!policyName.trim()) {
      setError('Veuillez saisir un nom de contrat');
      return;
    }

    pollAbortRef.current = false;
    setIsUploading(true);
    setProcessingPercent(5);
    setProcessingPhase('Envoi du document...');
    setError('');

    try {
      const csrfRes = await fetch(`${API_URL}/api/csrf-token`, { credentials: 'include' });
      const { csrfToken } = await csrfRes.json();
      
      const formData = new FormData();
      formData.append('pdf', pdfFile);
      formData.append('insurance_type_code', selectedType.code);
      formData.append('insurer_code', selectedInsurer.code);
      formData.append('user_email', userEmail);
      formData.append('contract_name', policyName.trim());
      formData.append('contract_version', contractVersion || '001');
      formData.append('doc_type', docType || 'CG');
      if (contractUrl.trim()) formData.append('contract_url', contractUrl.trim());
      if (selectedSubTypeCode) formData.append('insurance_sub_type_code', selectedSubTypeCode);

      const response = await fetch(`${API_URL}/api/cg/user/upload`, {
        method: 'POST',
        headers: { 'X-CSRF-Token': csrfToken },
        body: formData,
        credentials: 'include'
      });
      
      if (!response.ok) throw new Error('Upload failed');
      
      const data = await response.json(); // 202 — id retourné immédiatement
      const cgId = data.id;

      const phaseLabels: Record<string, string> = {
        extracting: 'Extraction du texte (locale)...',
        embedding: 'Analyse des métadonnées et formules...',
        processing: 'Vectorisation page par page...',
        done: 'Traitement terminé ✔️',
        failed: 'Erreur lors du traitement'
      };

      // Polling avec delay croissant pour éviter le rate-limiting nginx
      const pollStatus = (): Promise<void> => new Promise((resolve, reject) => {
        let retryDelay = 10000; // 10s initiales
        let consecutiveErrors = 0;

        const tick = async () => {
          if (pollAbortRef.current) {
            resolve();
            return;
          }

          try {
            const statusRes = await fetch(`${API_URL}/api/cg/user/status/${cgId}`, { credentials: 'include' });

            if (statusRes.status === 429) {
              // Rate limit — attendre plus longtemps
              retryDelay = Math.min(retryDelay * 2, 60000);
              console.warn(`Rate limit détecté, prøchain poll dans ${retryDelay / 1000}s`);
              setTimeout(tick, retryDelay);
              return;
            }

            consecutiveErrors = 0;
            retryDelay = 10000; // reset sur succès

            if (!statusRes.ok) { setTimeout(tick, retryDelay); return; }
            const status = await statusRes.json();

            setProcessingPercent(status.percent);
            setProcessingPhase(phaseLabels[status.status] || 'Traitement en cours...');

            if (status.status === 'done') {
              setCgData({
                id: cgId,
                formules: status.formules,
                options: status.options,
                resume_court: status.resume_court,
                insurer_name: status.insurer_name,
                insurance_type_name: status.insurance_type_name
              });
              setStep('configure');
              // Partage communautaire si l'utilisateur a coché la case
              if (shareConsent && docType === 'CG') {
                fetch(`${API_URL}/api/cg/user/promote-to-central/${cgId}`, {
                  method: 'POST',
                  credentials: 'include'
                }).catch(e => console.warn('[promote-to-central] non-bloquant:', e));
              }
              resolve();
            } else if (status.status === 'failed') {
              reject(new Error(status.error || 'Traitement échoué'));
            } else {
              setTimeout(tick, retryDelay);
            }
          } catch (e) {
            consecutiveErrors++;
            retryDelay = Math.min(10000 * consecutiveErrors, 60000);
            setTimeout(tick, retryDelay);
          }
        };

        // Premier appel après 10s (le traitement ne peut pas finir avant)
        setTimeout(tick, retryDelay);
      });

      await pollStatus();
      
    } catch (err: any) {
      console.error('Erreur upload:', err);
      setError(err.message === 'Upload failed' ? 'Erreur lors de l\'envoi du document' : (err.message || 'Erreur lors de l\'analyse du document'));
    } finally {
      setIsUploading(false);
    }
  };

  // Ajout au portefeuille (crée 1 ligne par sous-type sélectionné)
  const addToPortfolio = async () => {
    if (!policyName) {
      setError('Veuillez nommer le contrat');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const csrfRes = await fetch(`${API_URL}/api/csrf-token`, { credentials: 'include' });
      const { csrfToken } = await csrfRes.json();

      // En mode sans CG (isNoCgMode), on n'envoie pas de cg_id
      const cgPayload = (cgData?.id)
        ? { cg_source: mode === 'standard' ? 'central' : 'user', cg_id: cgData.id }
        : {};

      // Déterminer les sous-types à créer
      const subTypesToCreate = selectedSubTypeCodes.length > 0
        ? selectedSubTypeCodes
        : [null];   // null = pas de sous-type

      const createPolicy = async (subTypeCode: string | null) => {
        const response = await fetch(`${API_URL}/api/policies`, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'X-CSRF-Token': csrfToken
          },
          body: JSON.stringify({
            userId: userId,
            name: subTypesToCreate.length > 1 && subTypeCode
              ? `${policyName} - ${availableSubTypesStandard.find(s => s.code === subTypeCode)?.labelFr || subTypeCode}`
              : policyName,
            insurerCode: selectedInsurer!.code,
            insurance_type_code: selectedType!.code,
            insurance_sub_type_code: subTypeCode || undefined,
            formula: selectedFormule,
            options: selectedOptions,
            ...cgPayload,
            startDate: new Date().toISOString().split('T')[0],
            status: 'active'
          }),
          credentials: 'include'
        });
        if (!response.ok) {
          const errorData = await response.json();
          const msg = errorData.message === 'LIMIT_REACHED'
            ? (errorData.detail || 'Vous avez atteint la limite de 10 contrats dans votre portefeuille.')
            : (errorData.message || 'Add policy failed');
          throw new Error(msg);
        }
        return await response.json();
      };

      const createdPolicies: any[] = [];
      for (const code of subTypesToCreate) {
        const p = await createPolicy(code);
        createdPolicies.push(p);
      }

      console.log(`✅ ${createdPolicies.length} police(s) créée(s):`, createdPolicies.map(p => p.id));

      if (onAdd) {
        createdPolicies.forEach(p => onAdd(p));
      }

      const msg = createdPolicies.length > 1
        ? `✅ ${createdPolicies.length} contrats ajoutés au portefeuille`
        : '✅ Contrat ajouté au portefeuille';
      alert(msg);

      if (onCancel) onCancel();
    } catch (err: any) {
      console.error('Erreur ajout contrat:', err);
      setError(err.message || 'Erreur lors de l\'ajout au portefeuille');
    } finally {
      setLoading(false);
    }
  };

  const toggleOption = (option: string) => {
    setSelectedOptions(prev =>
      prev.includes(option) ? prev.filter(o => o !== option) : [...prev, option]
    );
  };

  // Renvoie l'URL de l'image du type d'assurance stockée dans /public/insurance-types/
  // Convention : /insurance-types/{CODE}.png  (ex: /insurance-types/AUT01.png)
  const getTypeImageUrl = (type: InsuranceType) =>
    (type as any).icon && ((type as any).icon.startsWith('/') || (type as any).icon.startsWith('http'))
      ? (type as any).icon
      : `/insurance-types/${type.code}.png`;

  const getFallbackIcon = (typeCode: string) =>
    insuranceIconsFallback[typeCode] || insuranceIconsFallback.DEFAULT;

  return (
    <div className="max-w-4xl mx-auto p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Ajouter un contrat</h1>
          <p className="text-sm text-gray-600 mt-1">
            {step === 'selectType' && 'Choisissez le type d\'assurance'}
            {step === 'selectInsurer' && 'Sélectionnez votre assureur'}
            {step === 'selectSubType' && 'Sélectionnez le(s) sous-type(s)'}
            {step === 'customConfig' && 'Renseignez les informations du document'}
            {step === 'configure' && 'Configurez votre contrat'}
          </p>
        </div>
        {onCancel && (
          <button
            onClick={onCancel}
            className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
          >
            <X className="w-6 h-6" />
          </button>
        )}
      </div>

      {/* Sélecteur de mode — onglets bien visibles */}
      <div className="flex mb-6 border-b-2 border-gray-200">
        <button
          onClick={async () => {
            if (mode !== 'standard') {
              setMode('standard');
              setStep('selectType');
              setSelectedType(null);
              setSelectedInsurer(null);
              setAvailableInsurers([]);
              setError('');
            }
          }}
          className={`flex-1 py-3 px-4 font-semibold text-sm transition-all border-b-4 -mb-0.5 ${
            mode === 'standard'
              ? 'border-blue-600 text-blue-700 bg-blue-50'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
          }`}
        >
          📋 Contrats centraux disponibles
        </button>
        <button
          onClick={async () => {
            if (mode !== 'custom') {
              setMode('custom');
              setStep('selectType');
              setSelectedType(null);
              setSelectedInsurer(null);
              setAvailableInsurers([]);
              setError('');
            }
          }}
          className={`flex-1 py-3 px-4 font-semibold text-sm transition-all border-b-4 -mb-0.5 ${
            mode === 'custom'
              ? 'border-blue-600 text-blue-700 bg-blue-50'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
          }`}
        >
          📄 Ajout de conditions
        </button>
      </div>

      {/* Description de l'onglet actif */}
      <div className={`mb-5 px-4 py-2 rounded-lg text-sm ${
        mode === 'standard'
          ? 'bg-blue-50 text-blue-800 border border-blue-100'
          : 'bg-amber-50 text-amber-800 border border-amber-100'
      }`}>
        {mode === 'standard'
          ? '🔎 Les CG listées proviennent de notre référentiel central. Choisissez votre assureur et votre formule.'
          : '📤 Chargez vos propres Conditions Générales (PDF) pour les analyser et les ajouter à votre portefeuille.'}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg mb-6 flex items-start gap-2">
          <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <span className="text-sm">{error}</span>
        </div>
      )}

      {/* Étape 1: Sélection du type d'assurance — grille avec images */}
      {step === 'selectType' && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {insuranceTypes.map(type => {
            const iconName = (type as any).icon || '';
            const IconComponent = LUCIDE_ICON_MAP[iconName] || insuranceIconsFallback[type.code] || ShieldPlus;
            const gradientClass = (type as any).color?.includes('from-') ? (type as any).color : 'from-primary-500 to-primary-600';
            const isSelected = selectedType?.code === type.code;
            return (
              <button
                key={type.code}
                onClick={() => handleSelectType(type)}
                className={`flex flex-col items-center gap-2 p-5 rounded-xl border-2 transition-all ${
                  isSelected
                    ? 'border-blue-500 bg-blue-50 shadow-md'
                    : 'border-gray-200 bg-white hover:border-blue-300 hover:shadow-sm hover:bg-gray-50'
                }`}
              >
                <div className={`w-16 h-16 rounded-xl flex items-center justify-center bg-gradient-to-br ${gradientClass}`}>
                  <IconComponent className="w-9 h-9 text-white" />
                </div>
                <span className={`text-xs font-medium text-center leading-tight ${
                  isSelected ? 'text-blue-700' : 'text-gray-700'
                }`}>
                  {type.labelFr}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Étape 2: Sélection de l'assureur */}
      {step === 'selectInsurer' && (
        <div className="space-y-4">
          <button
            onClick={() => setStep('selectType')}
            className="text-sm text-blue-600 hover:underline mb-4"
          >
            ← Changer le type d'assurance
          </button>

          {/* Barre de recherche (mode custom où la liste est longue) */}
          {mode === 'custom' && availableInsurers.length > 6 && (
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              <input
                type="text"
                value={insurerSearch}
                onChange={e => setInsurerSearch(e.target.value)}
                placeholder="Rechercher un assureur…"
                className="w-full pl-9 pr-4 py-2.5 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
              />
              {insurerSearch && (
                <button
                  onClick={() => setInsurerSearch('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          )}

          {/* CTA si aucun assureur trouvé en mode standard */}
          {mode === 'standard' && !isLoadingSubTypesStandard && availableInsurers.length === 0 && (
            <div className="col-span-2 bg-amber-50 border border-amber-200 rounded-xl p-5 text-center space-y-3">
              <p className="text-amber-800 text-sm font-medium">😕 Aucun contrat central disponible pour <strong>{selectedType?.labelFr}</strong> pour le moment.</p>
              <p className="text-amber-700 text-xs">Vous pouvez ajouter votre contrat manuellement en chargeant votre PDF.</p>
              <button
                onClick={() => {
                  setMode('custom');
                  setStep('selectInsurer');
                  if (selectedType) loadInsurersByType(selectedType.code, 'custom');
                }}
                className="px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-semibold hover:bg-amber-700 transition"
              >
                Basculer vers « Ajout de conditions » →
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {isLoadingSubTypesStandard && (
              <div className="col-span-2 text-center py-4 text-sm text-gray-500">
                ⏳ Vérification des sous-types disponibles...
              </div>
            )}
            {availableInsurers
              .filter(insurer =>
                !insurerSearch ||
                insurer.label.toLowerCase().includes(insurerSearch.toLowerCase()) ||
                (insurer.fullName || '').toLowerCase().includes(insurerSearch.toLowerCase())
              )
              .map(insurer => (
              <button
                key={insurer.code}
                onClick={() => !isLoadingSubTypesStandard && handleSelectInsurer(insurer)}
                disabled={isLoadingSubTypesStandard}
                className={`p-4 rounded-xl border-2 hover:border-blue-500 hover:shadow-lg transition-all text-left bg-white disabled:opacity-60 disabled:cursor-wait ${
                  insurer.code === 'AUTRE' ? 'border-dashed border-gray-300' : 'border-gray-200'
                }`}
                style={{ borderColor: selectedInsurer?.code === insurer.code ? insurer.color : undefined }}
              >
                <div className="flex items-center gap-3">
                  <div 
                    className="w-16 h-16 rounded-xl flex items-center justify-center overflow-hidden bg-white border border-gray-100 shadow-sm"
                    style={{ backgroundColor: insurer.logoUrl ? 'white' : (insurer.code === 'AUTRE' ? '#F3F4F6' : insurer.color) }}
                  >
                    {insurer.code === 'AUTRE' ? (
                      <span className="text-3xl">🏢</span>
                    ) : insurer.logoUrl ? (
                      <img src={insurer.logoUrl} alt={insurer.label} className="w-14 h-14 object-contain" onError={e => { (e.target as HTMLImageElement).style.display='none'; }} />
                    ) : (
                      <span className="text-white font-bold text-xl">{insurer.label.substring(0, 2)}</span>
                    )}
                  </div>
                  <div>
                    <h3 className="font-bold text-gray-900">{insurer.label}</h3>
                  </div>
                </div>
              </button>
            ))}
          </div>

          {/* CTA si l'assureur n'est pas dans la liste (mode standard) */}
          {mode === 'standard' && availableInsurers.length > 0 && (
            <div className="pt-2">
              <button
                onClick={() => {
                  setMode('custom');
                  setStep('selectInsurer');
                  setInsurerSearch('');
                  if (selectedType) loadInsurersByType(selectedType.code, 'custom');
                }}
                className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl border-2 border-dashed border-gray-300 text-sm font-semibold text-gray-600 hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50 transition-all"
              >
                <Upload className="w-4 h-4" />
                Votre assureur n'est pas dans la liste ? Ajouter vos propres conditions →
              </button>
            </div>
          )}
        </div>
      )}

      {/* Étape 2b (standard, sous-types multiples) : sélection multi des sous-types */}
      {step === 'selectSubType' && mode === 'standard' && (
        <div className="space-y-5">
          <button
            onClick={() => setStep('selectInsurer')}
            className="text-sm text-blue-600 hover:underline"
          >
            ← Changer l'assureur
          </button>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-800">
            🛂 Cet assureur propose plusieurs sous-types pour <strong>{selectedType?.labelFr}</strong>.
            Sélectionnez un ou plusieurs sous-types : <strong>une ligne de portefeuille sera créée pour chacun</strong>.
          </div>

          {isLoadingSubTypesStandard ? (
            <p className="text-sm text-gray-500">Chargement des sous-types...</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {availableSubTypesStandard.map(st => {
                const checked = selectedSubTypeCodes.includes(st.code);
                const label = st.labelFr || st.code; // fallback sur le code si label vide
                return (
                  <label
                    key={st.code}
                    className={`flex items-center gap-3 p-4 border-2 rounded-xl cursor-pointer transition-all ${
                      checked
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 bg-white hover:border-blue-300'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() =>
                        setSelectedSubTypeCodes(prev =>
                          checked ? prev.filter(c => c !== st.code) : [...prev, st.code]
                        )
                      }
                      className="w-5 h-5 text-blue-600 rounded"
                    />
                    <span className="font-medium text-gray-900">{label}</span>
                    {checked && <Check className="w-4 h-4 text-blue-600 ml-auto" />}
                  </label>
                );
              })}
            </div>
          )}

          <button
            onClick={async () => {
              if (selectedSubTypeCodes.length === 0) {
                setError('Veuillez sélectionner au moins un sous-type');
                return;
              }
              setError('');
              // Charger la CG du premier sous-type sélectionné pour avoir les formules
              await searchCG(selectedType!.code, selectedInsurer!.code, selectedInsurer!, selectedSubTypeCodes[0]);
            }}
            disabled={loading || selectedSubTypeCodes.length === 0}
            className="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 disabled:bg-gray-400 flex items-center justify-center gap-2"
          >
            {loading ? '⏳ Chargement...' : `Suivant → (${selectedSubTypeCodes.length} sélectionné)`}
          </button>
        </div>
      )}

      {/* Étape 2c (custom seulement): Informations du document CG */}
      {step === 'customConfig' && mode === 'custom' && (
        <div className="space-y-5">
          <button
            onClick={() => setStep('selectInsurer')}
            className="text-sm text-blue-600 hover:underline"
          >
            ← Changer l'assureur
          </button>

          {/* Nom du contrat */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Nom du contrat *
            </label>
            <input
              type="text"
              value={policyName}
              onChange={(e) => setPolicyName(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Ex: Assurance auto MAAF Tous Risques"
            />
          </div>

          {/* Version + Type */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Version</label>
              <input
                type="text"
                value={contractVersion}
                onChange={(e) => setContractVersion(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="001"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Type de document</label>
              <select
                value={docType}
                onChange={(e) => setDocType(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white"
              >
                <option value="CG">Conditions Générales</option>
                <option value="CP">Conditions Particulières</option>
                <option value="IPID">IPID</option>
                <option value="OTHER">Autre</option>
              </select>
            </div>
          </div>

          {/* Sous-type d'assurance */}
          {availableSubTypes.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Sous-type d'assurance</label>
              <div className="flex flex-wrap gap-2">
                {isLoadingSubTypes ? (
                  <span className="text-sm text-gray-500">Chargement...</span>
                ) : (
                  availableSubTypes.map(st => (
                    <button
                      key={st.code}
                      type="button"
                      onClick={() => setSelectedSubTypeCode(prev => prev === st.code ? '' : st.code)}
                      className={`px-3 py-1.5 rounded-full text-sm font-medium border-2 transition-all ${
                        selectedSubTypeCode === st.code
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-white text-gray-700 border-gray-300 hover:border-blue-400'
                      }`}
                    >
                      {st.labelFr}
                    </button>
                  ))
                )}
              </div>
            </div>
          )}

          {/* URL optionnel */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              <LinkIcon className="w-4 h-4 inline mr-1" />
              URL du document (optionnel)
            </label>
            <input
              type="url"
              value={contractUrl}
              onChange={(e) => setContractUrl(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="https://..."
            />
          </div>

          {/* PDF */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              <FileText className="w-4 h-4 inline mr-1" />
              Fichier PDF *
            </label>
            <input
              type="file"
              accept=".pdf"
              onChange={(e) => setPdfFile(e.target.files?.[0] || null)}
              className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
            />
            {pdfFile && (
              <p className="text-xs text-gray-500 mt-1">📎 {pdfFile.name} ({(pdfFile.size / 1024 / 1024).toFixed(2)} Mo)</p>
            )}
          </div>

          {/* Consentement partage communautaire — uniquement pour les CG */}
          {docType === 'CG' && (
            <label className="flex items-start gap-3 cursor-pointer p-3 rounded-xl border border-blue-100 bg-blue-50 hover:bg-blue-100 transition-colors">
              <input
                type="checkbox"
                checked={shareConsent}
                onChange={e => setShareConsent(e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded text-blue-600"
              />
              <span className="text-sm text-blue-900">
                <strong>Partager avec la communauté AssurClair</strong>
                <br />
                <span className="text-xs text-blue-700 font-normal">
                  En cochant cette case, vous autorisez le partage de ce document en lecture seule avec les autres utilisateurs, afin d'enrichir la base de référence commune. Aucune donnée personnelle ne sera partagée.
                </span>
              </span>
            </label>
          )}

          <button
            onClick={uploadCustomCG}
            disabled={isUploading || !pdfFile || !policyName.trim()}
            className="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isUploading ? (
              <>⏳ Traitement en cours ({processingPercent}%)...</>
            ) : (
              <><Upload className="w-5 h-5" /> Analyser et vectoriser</>  
            )}
          </button>

          {isUploading && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-3">
              {/* Barre de progression */}
              <div className="w-full bg-blue-200 rounded-full h-3 overflow-hidden">
                <div
                  className="h-3 rounded-full bg-blue-600 transition-all duration-700"
                  style={{ width: `${processingPercent}%` }}
                />
              </div>
              {/* Étiquette */}
              <div className="flex items-center justify-between text-sm text-blue-800">
                <span>{processingPhase || 'Traitement en cours...'}</span>
                <span className="font-bold">{processingPercent}%</span>
              </div>
              <p className="text-xs text-blue-600">
                L'analyse et la vectorisation peuvent prendre 1 à 3 minutes selon la taille du document. Le statut est vérifié toutes les 10 secondes.
              </p>
              {/* Bouton annuler */}
              <button
                onClick={cancelPolling}
                className="w-full mt-1 py-2 rounded-lg border border-red-300 text-red-600 text-sm font-medium hover:bg-red-50 transition"
              >
                ⏹ Arrêter le suivi (le traitement continue en arrière-plan)
              </button>
            </div>
          )}
        </div>
      )}

      {/* Étape 3: Configuration du contrat */}
      {step === 'configure' && (
        <div className="space-y-6">
          <button
            onClick={() => {
              if (mode === 'custom') {
                setStep('customConfig');
              } else if (availableSubTypesStandard.length >= 2) {
                setStep('selectSubType');
              } else {
                setStep('selectInsurer');
              }
              setCgData(null);
              setIsNoCgMode(false);
              setSelectedFormule('');
              setSelectedOptions([]);
            }}
            className="text-sm text-blue-600 hover:underline mb-4"
          >
            ← Changer l'assureur
          </button>

          {isNoCgMode && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-800">
              ℹ️ Aucune Condition Générale trouvée dans le référentiel pour cet assureur/type. Vous pouvez tout de même ajouter le contrat en saisissant votre formule manuellement.
            </div>
          )}

          {/* URL des Conditions Générales */}
          {cgData?.url && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex items-center gap-2">
              <LinkIcon className="w-4 h-4 text-blue-600 shrink-0" />
              <span className="text-xs text-blue-700 font-medium mr-1">Conditions Générales :</span>
              <a
                href={cgData.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-blue-600 hover:underline truncate"
              >
                {cgData.url.replace(/^https?:\/\//, '').substring(0, 60)}{cgData.url.length > 67 ? '…' : ''}
              </a>
            </div>
          )}

          {/* Résumé sous-types sélectionnés (mode standard multi-sous-type) */}
          {mode === 'standard' && selectedSubTypeCodes.length > 1 && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-800">
              ✅ <strong>{selectedSubTypeCodes.length} contrats</strong> seront créés dans votre portefeuille :&nbsp;
              {selectedSubTypeCodes.map(c => availableSubTypesStandard.find(s => s.code === c)?.labelFr || c).join(', ')}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium mb-2">Nom du contrat</label>
            <input
              type="text"
              value={policyName}
              onChange={(e) => setPolicyName(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Ex: Auto - MAAF Tous Risques"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-3">Formule</label>
            {cgData?.formules && cgData.formules.length > 0 ? (
              <div className="space-y-2">
                {cgData.formules.map(formule => (
                  <label 
                    key={formule} 
                    className={`flex items-center gap-3 p-4 border-2 rounded-lg cursor-pointer transition ${
                      selectedFormule === formule
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <input
                      type="radio"
                      name="formule"
                      value={formule}
                      checked={selectedFormule === formule}
                      onChange={(e) => {
                        setSelectedFormule(e.target.value);
                        setSelectedOptions([]);
                      }}
                      className="w-5 h-5 text-blue-600"
                    />
                    <span className="font-medium">{formule}</span>
                    {selectedFormule === formule && (
                      <Check className="w-5 h-5 text-blue-600 ml-auto" />
                    )}
                  </label>
                ))}
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  ℹ️ Aucune formule indexée pour ce contrat. Saisissez le nom de votre formule ou laissez vide.
                </p>
                <input
                  type="text"
                  value={selectedFormule}
                  onChange={(e) => setSelectedFormule(e.target.value)}
                  placeholder="Ex: Tiers, Tous Risques, Essentiel... (optionnel)"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
            )}
          </div>

          {(() => {
            if (!cgData?.options || Object.keys(cgData.options).length === 0) return null;

            // Find options for the selected formula (case-insensitive key match)
            const activeKey = selectedFormule
              ? Object.keys(cgData.options).find(
                  k => k.toLowerCase() === selectedFormule.toLowerCase()
                ) ?? null
              : null;
            const activeOptions: string[] = activeKey ? (cgData.options[activeKey] as string[]) : [];

            if (!selectedFormule) {
              return (
                <div className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 text-sm text-gray-500">
                  Sélectionnez une formule pour voir les options disponibles.
                </div>
              );
            }

            if (activeOptions.length === 0) return null;

            return (
              <div>
                <label className="block text-sm font-medium mb-3">
                  Options disponibles pour <span className="text-blue-600">{selectedFormule}</span>
                </label>
                <div className="space-y-2">
                  {activeOptions.map(option => (
                    <label
                      key={option}
                      className={`flex items-center gap-3 p-3 border-2 rounded-lg cursor-pointer transition ${
                        selectedOptions.includes(option)
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selectedOptions.includes(option)}
                        onChange={() => toggleOption(option)}
                        className="w-5 h-5 text-blue-600 rounded"
                      />
                      <span className="text-sm">{option}</span>
                      {selectedOptions.includes(option) && (
                        <Check className="w-4 h-4 text-blue-600 ml-auto" />
                      )}
                    </label>
                  ))}
                </div>
              </div>
            );
          })()}

          <button
            onClick={addToPortfolio}
            disabled={loading || !policyName}
            className="w-full bg-green-600 text-white py-3 rounded-lg font-semibold hover:bg-green-700 disabled:bg-gray-400 flex items-center justify-center gap-2"
          >
            {loading ? (
              '⏳ Ajout en cours...'
            ) : (
              <>
                <Check className="w-5 h-5" />
                Ajouter au portefeuille
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
};

export default AddPolicyPage;
