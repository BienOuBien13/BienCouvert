/**
 * Page d'ajout de contrat d'assurance - Interface visuelle améliorée
 * 2 modes : CG standards (depuis central_cg) ou CG personnalisées (upload PDF)
 */

import React, { useState, useEffect } from 'react';
import { Car, Home, Heart, Briefcase, ShieldPlus, Upload, Check, X, AlertCircle } from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || '';

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
}

interface CGData {
  id: number;
  formules: string[];
  options: {
    [key: string]: string[];
  };
  resume_court: string;
  insurer_name: string;
  insurance_type_name: string;
}

// Icônes par type d'assurance
const insuranceIcons: Record<string, React.FC<any>> = {
  AUT: Car,
  HAB: Home,
  SAN: Heart,
  PRO: Briefcase,
  DEFAULT: ShieldPlus
};

interface AddPolicyPageProps {
  onCancel?: () => void;
}

const AddPolicyPage: React.FC<AddPolicyPageProps> = ({ onCancel }) => {
  const [mode, setMode] = useState<'standard' | 'custom'>('standard');
  const [step, setStep] = useState<'selectType' | 'selectInsurer' | 'configure'>('selectType');
  
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
  
  // État général
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [userId, setUserId] = useState('');

  useEffect(() => {
    loadInsuranceTypes();
    loadUserData();
  }, []);

  const loadUserData = () => {
    const user = localStorage.getItem('user');
    if (user) {
      const userData = JSON.parse(user);
      console.log('User data from localStorage:', userData);
      setUserEmail(userData.email);
      setUserId(userData.id || userData.user_id || ''); // Try both id and user_id
      console.log('userId set to:', userData.id || userData.user_id);
    }
  };

  const loadInsuranceTypes = async () => {
    try {
      const response = await fetch(`${API_URL}/api/masterdata/insurance-types`);
      const data = await response.json();
      setInsuranceTypes(data);
    } catch (err) {
      console.error('Erreur chargement types:', err);
      setError('Impossible de charger les types d\'assurance');
    }
  };

  const loadInsurersByType = async (typeCode: string) => {
    try {
      const response = await fetch(`${API_URL}/api/masterdata/insurers-by-type/${typeCode}`);
      const data = await response.json();
      setAvailableInsurers(data);
    } catch (err) {
      console.error('Erreur chargement assureurs:', err);
      setError('Impossible de charger les assureurs');
    }
  };

  const handleSelectType = async (type: InsuranceType) => {
    setSelectedType(type);
    setError('');
    await loadInsurersByType(type.code);
    setStep('selectInsurer');
  };

  const handleSelectInsurer = async (insurer: Insurer) => {
    setSelectedInsurer(insurer);
    
    if (mode === 'standard') {
      await searchCG(selectedType!.code, insurer.code, insurer);
    } else {
      setStep('configure');
    }
  };

  // Mode standard : recherche des CG disponibles
  const searchCG = async (typeCode: string, insurerCode: string, insurer: Insurer) => {
    setLoading(true);
    setError('');

    try {
      // GET requests don't need CSRF token
      const url = `${API_URL}/api/cg/central/by-type-and-insurer?insurance_type_code=${encodeURIComponent(typeCode)}&insurer_code=${encodeURIComponent(insurerCode)}`;
      
      const response = await fetch(url, {
        credentials: 'include'
      });
      
      if (!response.ok) {
        if (response.status === 404) {
          throw new Error('NOT_FOUND');
        }
        throw new Error('API_ERROR');
      }
      
      const data = await response.json();
      console.log('CG Data received:', data);
      setCgData(data);
      setPolicyName(`${selectedType!.labelFr} - ${insurer.label}`);
      setStep('configure');
    } catch (err: any) {
      console.error('Error fetching CG:', err);
      if (err.message === 'NOT_FOUND') {
        setError('Aucune condition générale trouvée. Essayez le mode "CG Personnalisées".');
      } else {
        setError('Erreur lors de la recherche des conditions générales');
      }
    } finally {
      setLoading(false);
    }
  };

  // Mode personnalisé : upload PDF
  const uploadCustomCG = async () => {
    if (!pdfFile || !selectedType || !selectedInsurer) {
      setError('Veuillez sélectionner un fichier PDF');
      return;
    }

    setIsUploading(true);
    setError('');

    try {
      const csrfRes = await fetch(`${API_URL}/api/csrf-token`, { credentials: 'include' });
      const { csrfToken } = await csrfRes.json();
      
      const formData = new FormData();
      formData.append('pdf', pdfFile);
      formData.append('insurance_type_code', selectedType.code);
      formData.append('insurer_code', selectedInsurer.code);
      formData.append('user_email', userEmail);

      const response = await fetch(`${API_URL}/api/cg/user/upload`, {
        method: 'POST',
        headers: { 
          'X-CSRF-Token': csrfToken
        },
        body: formData,
        credentials: 'include'
      });
      
      if (!response.ok) throw new Error('Upload failed');
      
      const data = await response.json();

      setCgData({
        id: data.id,
        formules: data.formules,
        options: data.options,
        resume_court: data.resume_court,
        insurer_name: data.insurer_name,
        insurance_type_name: data.insurance_type_name
      });

      setPolicyName(`${data.insurance_type_name} - ${data.insurer_name}`);
      
    } catch (err: any) {
      console.error('Erreur upload:', err);
      setError('Erreur lors de l\'analyse du document');
    } finally {
      setIsUploading(false);
    }
  };

  // Ajout au portefeuille
  const addToPortfolio = async () => {
    if (!cgData || !selectedFormule || !policyName) {
      setError('Veuillez sélectionner une formule et nommer le contrat');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const csrfRes = await fetch(`${API_URL}/api/csrf-token`, { credentials: 'include' });
      const { csrfToken } = await csrfRes.json();

      const response = await fetch(`${API_URL}/api/policies`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'X-CSRF-Token': csrfToken
        },
        body: JSON.stringify({
          userId: userId,
          name: policyName,
          insurer_code: selectedInsurer!.code,
          insurance_type_code: selectedType!.code,
          formula: selectedFormule,
          options: selectedOptions,
          cg_source: mode === 'standard' ? 'central' : 'user',
          cg_id: cgData.id
        }),
        credentials: 'include'
      });
      
      if (!response.ok) throw new Error('Add policy failed');

      alert('✅ Contrat ajouté au portefeuille');
      if (onCancel) onCancel();
    } catch (err: any) {
      console.error('Erreur ajout contrat:', err);
      setError('Erreur lors de l\'ajout au portefeuille');
    } finally {
      setLoading(false);
    }
  };

  const toggleOption = (option: string) => {
    setSelectedOptions(prev =>
      prev.includes(option) ? prev.filter(o => o !== option) : [...prev, option]
    );
  };

  const getIcon = (typeCode: string) => {
    const IconComponent = insuranceIcons[typeCode] || insuranceIcons.DEFAULT;
    return IconComponent;
  };

  return (
    <div className="max-w-4xl mx-auto p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Ajouter un contrat</h1>
          <p className="text-sm text-gray-600 mt-1">
            {step === 'selectType' && 'Choisissez le type d\'assurance'}
            {step === 'selectInsurer' && 'Sélectionnez votre assureur'}
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

      {/* Sélecteur de mode */}
      <div className="flex gap-2 mb-6 bg-gray-100 p-1 rounded-xl">
        <button
          onClick={() => setMode('standard')}
          className={`flex-1 py-2 px-4 rounded-lg font-semibold text-sm transition ${
            mode === 'standard'
              ? 'bg-white text-blue-600 shadow-sm'
              : 'text-gray-600'
          }`}
        >
          📋 CG Standards
        </button>
        <button
          onClick={() => setMode('custom')}
          className={`flex-1 py-2 px-4 rounded-lg font-semibold text-sm transition ${
            mode === 'custom'
              ? 'bg-white text-blue-600 shadow-sm'
              : 'text-gray-600'
          }`}
        >
          📄 CG Personnalisées
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg mb-6 flex items-start gap-2">
          <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <span className="text-sm">{error}</span>
        </div>
      )}

      {/* Étape 1: Sélection du type d'assurance */}
      {step === 'selectType' && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {insuranceTypes.map(type => {
            const IconComponent = getIcon(type.code);
            return (
              <button
                key={type.code}
                onClick={() => handleSelectType(type)}
                className="relative p-6 rounded-2xl border-2 border-gray-200 hover:border-blue-500 hover:shadow-lg transition-all group bg-white"
                style={{ borderColor: selectedType?.code === type.code ? type.color : undefined }}
              >
                <div 
                  className="w-16 h-16 rounded-full mx-auto mb-3 flex items-center justify-center text-white"
                  style={{ backgroundColor: type.color }}
                >
                  <IconComponent className="w-8 h-8" />
                </div>
                <h3 className="font-bold text-center text-gray-900">{type.labelFr}</h3>
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
          
          {mode === 'custom' && !cgData && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
              <label className="block text-sm font-medium mb-2">Document PDF des conditions générales</label>
              <input
                type="file"
                accept=".pdf"
                onChange={(e) => setPdfFile(e.target.files?.[0] || null)}
                className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
              />
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {availableInsurers.map(insurer => (
              <button
                key={insurer.code}
                onClick={() => handleSelectInsurer(insurer)}
                disabled={mode === 'custom' && !pdfFile}
                className="p-4 rounded-xl border-2 border-gray-200 hover:border-blue-500 hover:shadow-lg transition-all text-left bg-white disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ borderColor: selectedInsurer?.code === insurer.code ? insurer.color : undefined }}
              >
                <div className="flex items-center gap-3">
                  <div 
                    className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-lg"
                    style={{ backgroundColor: insurer.color }}
                  >
                    {insurer.label.substring(0, 2)}
                  </div>
                  <div>
                    <h3 className="font-bold text-gray-900">{insurer.label}</h3>
                    <p className="text-sm text-gray-600">{insurer.fullName}</p>
                  </div>
                </div>
              </button>
            ))}
          </div>

          {mode === 'custom' && pdfFile && !cgData && (
            <button
              onClick={uploadCustomCG}
              disabled={isUploading}
              className="w-full mt-4 bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 disabled:bg-gray-400 flex items-center justify-center gap-2"
            >
              {isUploading ? (
                <>⏳ Analyse en cours...</>
              ) : (
                <>
                  <Upload className="w-5 h-5" />
                  Analyser le document
                </>
              )}
            </button>
          )}
        </div>
      )}

      {/* Étape 3: Configuration du contrat */}
      {step === 'configure' && cgData && (
        <div className="space-y-6">
          <button
            onClick={() => {
              setStep('selectInsurer');
              setCgData(null);
              setSelectedFormule('');
              setSelectedOptions([]);
            }}
            className="text-sm text-blue-600 hover:underline mb-4"
          >
            ← Changer l'assureur
          </button>

          {cgData.resume_court && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <p className="text-sm text-blue-900">{cgData.resume_court}</p>
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
                    onChange={(e) => setSelectedFormule(e.target.value)}
                    className="w-5 h-5 text-blue-600"
                  />
                  <span className="font-medium">{formule}</span>
                  {selectedFormule === formule && (
                    <Check className="w-5 h-5 text-blue-600 ml-auto" />
                  )}
                </label>
              ))}
            </div>
          </div>

          {cgData.options && Object.keys(cgData.options).length > 0 && (
            <div>
              <label className="block text-sm font-medium mb-3">Options</label>
              <div className="space-y-3">
                {Object.entries(cgData.options).map(([category, opts]) => (
                  <div key={category}>
                    <p className="text-xs text-gray-500 uppercase mb-2 font-semibold">{category.replace('_', ' ')}</p>
                    <div className="space-y-2">
                      {(opts as string[]).map(option => (
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
                ))}
              </div>
            </div>
          )}

          <button
            onClick={addToPortfolio}
            disabled={loading || !selectedFormule || !policyName}
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
