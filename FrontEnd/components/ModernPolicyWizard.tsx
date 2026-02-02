import React, { useState, useRef } from 'react';
import { Policy, User } from '../types';
import { 
  Home, Car, Heart, Briefcase, Shield, Upload, Check, ArrowRight, 
  ArrowLeft, X, FileText, Calendar, DollarSign, Sparkles, Zap, Loader
} from 'lucide-react';
import { uuid } from '../utils/uuid';
import { useMasterData } from '../hooks/useMasterData';

interface Props {
  user: User;
  onAddPolicy: (policy: Omit<Policy, 'userId'>) => void;
  onCancel: () => void;
}

interface InsuranceType {
  id: string;
  name: string;
  icon: React.ElementType;
  gradient: string;
  description: string;
}

// Mapping des icônes
const TYPE_ICONS: Record<string, React.ElementType> = {
  AUTO: Car,
  HABITATION: Home,
  SANTE: Heart,
  PRO: Briefcase,
  AUTRE: Shield,
};

const TYPE_GRADIENTS: Record<string, string> = {
  AUTO: 'from-red-500 to-orange-500',
  HABITATION: 'from-blue-500 to-cyan-500',
  SANTE: 'from-pink-500 to-rose-500',
  PRO: 'from-purple-500 to-indigo-500',
  AUTRE: 'from-slate-500 to-slate-600',
};

export const ModernPolicyWizard: React.FC<Props> = ({ user, onAddPolicy, onCancel }) => {
  const { types: masterTypes, insurers: masterInsurers, loading: masterDataLoading } = useMasterData();
  
  // Conversion des master data
  const TYPES: InsuranceType[] = masterTypes.map(type => ({
    id: type.code.toLowerCase(),
    name: type.labelFr,
    icon: TYPE_ICONS[type.code] || Shield,
    gradient: TYPE_GRADIENTS[type.code] || 'from-slate-500 to-slate-600',
    description: type.description || `Assurance ${type.labelFr.toLowerCase()}`,
  }));
  
  const INSURERS = masterInsurers.map(insurer => ({
    id: insurer.code.toLowerCase(),
    name: insurer.label,
    color: insurer.color || 'bg-slate-600',
  }));
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    type: '',
    insurer: '',
    name: '',
    policyNumber: '',
    premium: '',
    coverage: '',
    startDate: '',
    file: null as File | null,
  });
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleTypeSelect = (typeId: string) => {
    setFormData({ ...formData, type: typeId });
    setTimeout(() => setStep(2), 300);
  };

  const handleInsurerSelect = (insurerId: string) => {
    const insurerName = INSURERS.find(i => i.id === insurerId)?.name || insurerId;
    setFormData({ ...formData, insurer: insurerName });
    setTimeout(() => setStep(3), 300);
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileChange(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (file: File) => {
    if (file.type === 'application/pdf' || file.type.startsWith('image/')) {
      setFormData({ ...formData, file });
    }
  };

  const handleSubmit = () => {
    const typeName = TYPES.find(t => t.id === formData.type)?.name || formData.type;
    
    const newPolicy: Omit<Policy, 'userId'> = {
      id: uuid(),
      name: formData.name || `${typeName} ${formData.insurer}`,
      insurer: formData.insurer,
      type: typeName,
      coverageDetail: formData.coverage || '',
      options: [],
      summary: `Contrat ${typeName} ajouté via wizard`,
      sourceUrl: null,
      isInternalSource: true,
      addedAt: Date.now(),
      fileData: null,
      fileName: formData.file?.name || null,
      mimeType: formData.file?.type || 'text/plain'
    };

    onAddPolicy(newPolicy);
  };

  const progress = (step / 4) * 100;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fadeIn">
      <div className="bg-white rounded-[3rem] shadow-2xl w-full max-w-4xl overflow-hidden">
        {/* Header */}
        <div className="relative bg-gradient-to-br from-primary-600 via-primary-500 to-cyan-500 p-8 text-white">
          <button onClick={onCancel} className="absolute top-6 right-6 p-2 hover:bg-white/20 rounded-full transition-all">
            <X className="w-6 h-6" />
          </button>
          <div className="flex items-center gap-4 mb-6">
            <div className="w-16 h-16 bg-white/20 backdrop-blur-md rounded-2xl flex items-center justify-center">
              <Zap className="w-8 h-8" />
            </div>
            <div>
              <h2 className="text-3xl font-black tracking-tight">Nouveau Contrat</h2>
              <p className="text-primary-100 font-medium">Ajoutez en quelques secondes</p>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="relative w-full h-2 bg-white/20 rounded-full overflow-hidden">
            <div 
              className="absolute top-0 left-0 h-full bg-white rounded-full transition-all duration-500 ease-out shadow-lg"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="mt-3 flex justify-between text-xs font-bold text-white/80">
            <span className={step >= 1 ? 'text-white' : ''}>Type</span>
            <span className={step >= 2 ? 'text-white' : ''}>Assureur</span>
            <span className={step >= 3 ? 'text-white' : ''}>Détails</span>
            <span className={step >= 4 ? 'text-white' : ''}>Confirmation</span>
          </div>
        </div>

        {/* Content */}
        <div className="p-8 min-h-[400px]">
          {/* Step 1: Type */}
          {step === 1 && (
            <div className="space-y-6 animate-fadeIn">
              <h3 className="text-2xl font-black text-slate-900">Quel type d'assurance ?</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {TYPES.map((type) => {
                  const Icon = type.icon;
                  return (
                    <button
                      key={type.id}
                      onClick={() => handleTypeSelect(type.id)}
                      className="group relative overflow-hidden rounded-3xl p-6 text-left transition-all hover:scale-105 hover:shadow-2xl active:scale-95"
                    >
                      <div className={`absolute inset-0 bg-gradient-to-br ${type.gradient} opacity-90 group-hover:opacity-100 transition-opacity`} />
                      <div className="relative z-10">
                        <Icon className="w-10 h-10 text-white mb-3" />
                        <h4 className="text-xl font-black text-white mb-1">{type.name}</h4>
                        <p className="text-sm text-white/80 font-medium">{type.description}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Step 2: Insurer */}
          {step === 2 && (
            <div className="space-y-6 animate-fadeIn">
              <button onClick={() => setStep(1)} className="flex items-center gap-2 text-slate-600 hover:text-slate-900 font-bold mb-2">
                <ArrowLeft className="w-4 h-4" />
                Retour
              </button>
              <h3 className="text-2xl font-black text-slate-900">Chez quel assureur ?</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {INSURERS.map((insurer) => (
                  <button
                    key={insurer.id}
                    onClick={() => handleInsurerSelect(insurer.id)}
                    className={`${insurer.color} text-white rounded-2xl p-6 font-black text-lg hover:scale-105 hover:shadow-xl transition-all active:scale-95`}
                  >
                    {insurer.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Step 3: Details */}
          {step === 3 && (
            <div className="space-y-6 animate-fadeIn">
              <button onClick={() => setStep(2)} className="flex items-center gap-2 text-slate-600 hover:text-slate-900 font-bold mb-2">
                <ArrowLeft className="w-4 h-4" />
                Retour
              </button>
              <h3 className="text-2xl font-black text-slate-900">Les détails du contrat</h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-sm font-black text-slate-700 uppercase tracking-wide">Nom du contrat</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Ex: Habitation Résidence Principale"
                    className="w-full px-4 py-3 rounded-xl border-2 border-slate-200 focus:border-primary-500 outline-none font-medium"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-black text-slate-700 uppercase tracking-wide">N° de contrat</label>
                  <input
                    type="text"
                    value={formData.policyNumber}
                    onChange={(e) => setFormData({ ...formData, policyNumber: e.target.value })}
                    placeholder="Ex: 123456789"
                    className="w-full px-4 py-3 rounded-xl border-2 border-slate-200 focus:border-primary-500 outline-none font-medium"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-black text-slate-700 uppercase tracking-wide flex items-center gap-2">
                    <DollarSign className="w-4 h-4" />
                    Prime annuelle (€)
                  </label>
                  <input
                    type="number"
                    value={formData.premium}
                    onChange={(e) => setFormData({ ...formData, premium: e.target.value })}
                    placeholder="Ex: 450"
                    className="w-full px-4 py-3 rounded-xl border-2 border-slate-200 focus:border-primary-500 outline-none font-medium"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-black text-slate-700 uppercase tracking-wide flex items-center gap-2">
                    <Calendar className="w-4 h-4" />
                    Date de début
                  </label>
                  <input
                    type="date"
                    value={formData.startDate}
                    onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl border-2 border-slate-200 focus:border-primary-500 outline-none font-medium"
                  />
                </div>
              </div>

              {/* File Upload */}
              <div
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
                className={`relative border-2 border-dashed rounded-2xl p-8 text-center transition-all ${
                  dragActive 
                    ? 'border-primary-500 bg-primary-50' 
                    : formData.file 
                      ? 'border-green-500 bg-green-50' 
                      : 'border-slate-300 hover:border-slate-400'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,image/*"
                  onChange={(e) => e.target.files && handleFileChange(e.target.files[0])}
                  className="hidden"
                />
                {formData.file ? (
                  <div className="flex items-center justify-center gap-3">
                    <FileText className="w-8 h-8 text-green-600" />
                    <div className="text-left">
                      <p className="font-bold text-slate-900">{formData.file.name}</p>
                      <p className="text-sm text-slate-500">{(formData.file.size / 1024).toFixed(1)} KB</p>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setFormData({ ...formData, file: null });
                      }}
                      className="ml-auto p-2 hover:bg-red-100 rounded-full"
                    >
                      <X className="w-5 h-5 text-red-600" />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full"
                  >
                    <Upload className="w-12 h-12 text-slate-400 mx-auto mb-3" />
                    <p className="text-lg font-bold text-slate-700 mb-1">Glissez votre PDF ici</p>
                    <p className="text-sm text-slate-500">ou cliquez pour sélectionner</p>
                  </button>
                )}
              </div>

              <button
                onClick={() => setStep(4)}
                className="w-full bg-gradient-to-r from-primary-600 to-cyan-600 text-white py-4 rounded-2xl font-black text-lg hover:shadow-xl transition-all flex items-center justify-center gap-2 group"
              >
                Continuer
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </button>
            </div>
          )}

          {/* Step 4: Confirmation */}
          {step === 4 && (
            <div className="space-y-6 animate-fadeIn">
              <button onClick={() => setStep(3)} className="flex items-center gap-2 text-slate-600 hover:text-slate-900 font-bold mb-2">
                <ArrowLeft className="w-4 h-4" />
                Modifier
              </button>
              <div className="text-center mb-6">
                <div className="w-20 h-20 bg-gradient-to-br from-green-400 to-emerald-500 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Check className="w-10 h-10 text-white" />
                </div>
                <h3 className="text-2xl font-black text-slate-900 mb-2">Tout est prêt !</h3>
                <p className="text-slate-600 font-medium">Vérifiez les informations avant de créer le contrat</p>
              </div>

              <div className="bg-slate-50 rounded-2xl p-6 space-y-4">
                <div className="flex justify-between">
                  <span className="text-slate-600 font-medium">Type</span>
                  <span className="font-black text-slate-900">{TYPES.find(t => t.id === formData.type)?.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600 font-medium">Assureur</span>
                  <span className="font-black text-slate-900">{formData.insurer}</span>
                </div>
                {formData.name && (
                  <div className="flex justify-between">
                    <span className="text-slate-600 font-medium">Nom</span>
                    <span className="font-black text-slate-900">{formData.name}</span>
                  </div>
                )}
                {formData.policyNumber && (
                  <div className="flex justify-between">
                    <span className="text-slate-600 font-medium">N° Contrat</span>
                    <span className="font-black text-slate-900">{formData.policyNumber}</span>
                  </div>
                )}
                {formData.premium && (
                  <div className="flex justify-between">
                    <span className="text-slate-600 font-medium">Prime annuelle</span>
                    <span className="font-black text-slate-900">{formData.premium}€</span>
                  </div>
                )}
                {formData.file && (
                  <div className="flex justify-between">
                    <span className="text-slate-600 font-medium">Document</span>
                    <span className="font-black text-slate-900">{formData.file.name}</span>
                  </div>
                )}
              </div>

              <button
                onClick={handleSubmit}
                className="w-full bg-gradient-to-r from-green-500 to-emerald-500 text-white py-4 rounded-2xl font-black text-lg hover:shadow-xl transition-all flex items-center justify-center gap-2 group"
              >
                <Sparkles className="w-5 h-5" />
                Créer le contrat
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
