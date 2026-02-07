/**
 * Page d'ajout de contrat d'assurance
 * 2 modes : CG standards (depuis central_cg) ou CG personnalisées (upload PDF)
 */

import React, { useState, useEffect } from 'react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

interface InsuranceType {
  code: string;
  name: string;
}

interface Insurer {
  code: string;
  name: string;
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

interface AddPolicyPageProps {
  onCancel?: () => void;
}

const AddPolicyPage: React.FC<AddPolicyPageProps> = ({ onCancel }) => {
  const [mode, setMode] = useState<'standard' | 'custom'>('standard');
  
  // Master data
  const [insuranceTypes, setInsuranceTypes] = useState<InsuranceType[]>([]);
  const [insurers, setInsurers] = useState<Insurer[]>([]);
  
  // Formulaire standard
  const [selectedType, setSelectedType] = useState('');
  const [selectedInsurer, setSelectedInsurer] = useState('');
  const [cgData, setCgData] = useState<CGData | null>(null);
  const [selectedFormule, setSelectedFormule] = useState('');
  const [selectedOptions, setSelectedOptions] = useState<string[]>([]);
  const [policyName, setPolicyName] = useState('');
  
  // Formulaire personnalisé
  const [customInsurer, setCustomInsurer] = useState('');
  const [customType, setCustomType] = useState('');
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  
  // État général
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [userEmail, setUserEmail] = useState('');

  useEffect(() => {
    loadMasterData();
    loadUserEmail();
  }, []);

  const loadUserEmail = () => {
    const user = localStorage.getItem('user');
    if (user) {
      const userData = JSON.parse(user);
      setUserEmail(userData.email);
    }
  };

  const loadMasterData = async () => {
    try {
      const [typesRes, insurersRes] = await Promise.all([
        fetch(`${API_URL}/api/masterdata/insurance-types`).then(r => r.json()),
        fetch(`${API_URL}/api/masterdata/insurers`).then(r => r.json())
      ]);
      setInsuranceTypes(typesRes);
      setInsurers(insurersRes);
    } catch (err) {
      console.error('Erreur chargement données:', err);
      setError('Impossible de charger les données');
    }
  };

  // Mode standard : recherche des CG disponibles
  const searchCG = async () => {
    if (!selectedType || !selectedInsurer) {
      setError('Veuillez sélectionner un type d\'assurance et un assureur');
      return;
    }

    setLoading(true);
    setError('');
    setCgData(null);

    try {
      const csrfRes = await fetch(`${API_URL}/api/csrf-token`, { credentials: 'include' });
      const { csrfToken } = await csrfRes.json();
      
      const url = new URL(`${API_URL}/api/cg/central/by-type-and-insurer`);
      url.searchParams.append('insurance_type_code', selectedType);
      url.searchParams.append('insurer_code', selectedInsurer);
      
      const response = await fetch(url.toString(), {
        headers: { 'X-CSRF-Token': csrfToken },
        credentials: 'include'
      });
      
      if (!response.ok) {
        if (response.status === 404) {
          throw new Error('NOT_FOUND');
        }
        throw new Error('API_ERROR');
      }
      
      const data = await response.json();
      setCgData(data);
      
      // Pré-remplir le nom du contrat
      const typeName = insuranceTypes.find(t => t.code === selectedType)?.name || '';
      const insurerName = insurers.find(i => i.code === selectedInsurer)?.name || '';
      setPolicyName(`${typeName} - ${insurerName}`);
    } catch (err: any) {
      if (err.message === 'NOT_FOUND') {
        setError('Aucune condition générale trouvée pour cette combinaison. Essayez le mode "CG Personnalisées".');
      } else {
        setError('Erreur lors de la recherche des conditions générales');
      }
    } finally {
      setLoading(false);
    }
  };

  // Mode personnalisé : upload PDF
  const uploadCustomCG = async () => {
    if (!customType || !customInsurer || !pdfFile) {
      setError('Veuillez remplir tous les champs et sélectionner un fichier PDF');
      return;
    }

    setIsUploading(true);
    setError('');

    try {
      const csrfRes = await fetch(`${API_URL}/api/csrf-token`, { credentials: 'include' });
      const { csrfToken } = await csrfRes.json();
      
      const formData = new FormData();
      formData.append('pdf', pdfFile);
      formData.append('insurance_type_code', customType);
      formData.append('insurer_code', customInsurer);
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

      // Pré-remplir le nom du contrat
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
      
      const insurerCode = mode === 'standard' ? selectedInsurer : customInsurer;
      const typeCode = mode === 'standard' ? selectedType : customType;

      const response = await fetch(`${API_URL}/api/policies`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'X-CSRF-Token': csrfToken
        },
        body: JSON.stringify({
          name: policyName,
          insurer_code: insurerCode,
          insurance_type_code: typeCode,
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

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6">Ajouter un contrat d'assurance</h1>

      {/* Sélecteur de mode */}
      <div className="flex gap-4 mb-8">
        <button
          onClick={() => setMode('standard')}
          className={`flex-1 py-3 px-6 rounded-lg font-semibold transition ${
            mode === 'standard'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
          }`}
        >
          📋 CG Standards
        </button>
        <button
          onClick={() => setMode('custom')}
          className={`flex-1 py-3 px-6 rounded-lg font-semibold transition ${
            mode === 'custom'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
          }`}
        >
          📄 CG Personnalisées
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg mb-6">
          {error}
        </div>
      )}

      {/* Mode Standard */}
      {mode === 'standard' && !cgData && (
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Rechercher des conditions générales</h2>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">Type d'assurance</label>
              <select
                value={selectedType}
                onChange={(e) => setSelectedType(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg"
              >
                <option value="">-- Sélectionner --</option>
                {insuranceTypes.map(type => (
                  <option key={type.code} value={type.code}>{type.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Assureur</label>
              <select
                value={selectedInsurer}
                onChange={(e) => setSelectedInsurer(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg"
              >
                <option value="">-- Sélectionner --</option>
                {insurers.map(ins => (
                  <option key={ins.code} value={ins.code}>{ins.name}</option>
                ))}
              </select>
            </div>

            <button
              onClick={searchCG}
              disabled={loading}
              className="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 disabled:bg-gray-400"
            >
              {loading ? '🔍 Recherche...' : '🔍 Rechercher'}
            </button>
          </div>
        </div>
      )}

      {/* Mode Personnalisé */}
      {mode === 'custom' && !cgData && (
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Importer des conditions générales</h2>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">Type d'assurance</label>
              <select
                value={customType}
                onChange={(e) => setCustomType(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg"
              >
                <option value="">-- Sélectionner --</option>
                {insuranceTypes.map(type => (
                  <option key={type.code} value={type.code}>{type.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Assureur</label>
              <select
                value={customInsurer}
                onChange={(e) => setCustomInsurer(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg"
              >
                <option value="">-- Sélectionner --</option>
                {insurers.map(ins => (
                  <option key={ins.code} value={ins.code}>{ins.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Document PDF</label>
              <input
                type="file"
                accept=".pdf"
                onChange={(e) => setPdfFile(e.target.files?.[0] || null)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg"
              />
            </div>

            <button
              onClick={uploadCustomCG}
              disabled={isUploading}
              className="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 disabled:bg-gray-400"
            >
              {isUploading ? '⏳ Analyse en cours...' : '📤 Analyser le document'}
            </button>
          </div>
        </div>
      )}

      {/* Affichage des formules et options */}
      {cgData && (
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-semibold mb-4">
            {cgData.insurance_type_name} - {cgData.insurer_name}
          </h2>

          {cgData.resume_court && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
              <p className="text-sm text-blue-900">{cgData.resume_court}</p>
            </div>
          )}

          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium mb-2">Nom du contrat</label>
              <input
                type="text"
                value={policyName}
                onChange={(e) => setPolicyName(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                placeholder="Ex: Auto - MAAF Tous Risques"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Formule</label>
              <div className="space-y-2">
                {cgData.formules.map(formule => (
                  <label key={formule} className="flex items-center space-x-3 p-3 border border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50">
                    <input
                      type="radio"
                      name="formule"
                      value={formule}
                      checked={selectedFormule === formule}
                      onChange={(e) => setSelectedFormule(e.target.value)}
                      className="w-4 h-4"
                    />
                    <span>{formule}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Options */}
            {cgData.options && Object.keys(cgData.options).length > 0 && (
              <div>
                <label className="block text-sm font-medium mb-2">Options</label>
                <div className="space-y-2">
                  {Object.entries(cgData.options).map(([category, opts]) => (
                    <div key={category}>
                      <p className="text-xs text-gray-500 uppercase mb-2">{category.replace('_', ' ')}</p>
                      {(opts as string[]).map(option => (
                        <label key={option} className="flex items-center space-x-3 p-3 border border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50">
                          <input
                            type="checkbox"
                            checked={selectedOptions.includes(option)}
                            onChange={() => toggleOption(option)}
                            className="w-4 h-4"
                          />
                          <span>{option}</span>
                        </label>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <button
              onClick={addToPortfolio}
              disabled={loading || !selectedFormule || !policyName}
              className="w-full bg-green-600 text-white py-3 rounded-lg font-semibold hover:bg-green-700 disabled:bg-gray-400"
            >
              {loading ? '⏳ Ajout en cours...' : '✅ Ajouter au portefeuille'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default AddPolicyPage;
