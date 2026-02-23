/**
 * PartnerDashboard — Vue dédiée aux partenaires (courtiers)
 *
 * - Liste des demandes de RDV clients (onglet "Demandes")
 * - Dossiers pris en charge (onglet "Mes dossiers")
 * - Profil synthétique du client sélectionné (assurances + profil perso)
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Briefcase, ChevronDown, ChevronRight, User as UserIcon,
  Phone, Calendar, CheckCircle2, Clock, XCircle, Car, Home, Heart,
  Scale, CreditCard, Banknote, Smartphone, Shield, Loader2,
  RefreshCw, AlertCircle, ClipboardList, Zap, Euro, MapPin,
  Users, Baby, Building2, BarChart2
} from 'lucide-react';
import { authService } from '../services/authService';
import { PolicyType } from '../types';

const API_URL = (import.meta as any).env?.VITE_API_URL || '';

// ─── Types locaux ─────────────────────────────────────────────────────────────

interface RdvRequest {
  id: number;
  user_email: string;
  phone: string;
  day: string;
  slot: string;
  policies: string[];
  created_at: string;
  first_name: string | null;
  last_name: string | null;
  assignment_id: number | null;
  partner_id: number | null;
  assigned_at: string | null;
  assignment_status: string | null;
  partner_first_name: string | null;
  partner_last_name: string | null;
}

interface ClientProfile {
  user: {
    id: number;
    email: string;
    firstName: string;
    lastName: string;
    profile: Record<string, any>;
  };
  policies: ClientPolicy[];
  rdvRequests: RdvRequest[];
}

interface ClientPolicy {
  id: number;
  insurer_code: string;
  insurance_type_code: string;
  insurer_label: string;
  insurer_logo: string | null;
  type_label: string;
  metadata: any;
  created_at: string;
}

// ─── Helpers visuels ─────────────────────────────────────────────────────────

const STATUS_MAP: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  assigned:  { label: 'Pris en charge',  color: 'bg-blue-50 text-blue-700 border-blue-200',    icon: Briefcase },
  contacted: { label: 'Contacté',        color: 'bg-amber-50 text-amber-700 border-amber-200',  icon: Phone },
  completed: { label: 'Terminé',         color: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: CheckCircle2 },
  cancelled: { label: 'Annulé',          color: 'bg-slate-50 text-slate-500 border-slate-200',  icon: XCircle },
};

const getPolicyIcon = (typeCode: string) => {
  switch (typeCode) {
    case 'AUTO':       return Car;
    case 'HABITATION': return Home;
    case 'SANTE':      return Heart;
    case 'PJ':         return Scale;
    case 'CB':         return CreditCard;
    case 'EMPRUNTEUR': return Banknote;
    case 'MOBILE':     return Smartphone;
    default:           return Shield;
  }
};

// ─── Sous-composant : Badge de statut ─────────────────────────────────────────

const StatusBadge: React.FC<{ status: string | null }> = ({ status }) => {
  const s = STATUS_MAP[status || ''];
  if (!s) return <span className="text-[9px] font-black text-slate-400 uppercase">En attente</span>;
  const Icon = s.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border ${s.color}`}>
      <Icon className="w-3 h-3" />
      {s.label}
    </span>
  );
};

// ─── Sous-composant : Profil client synthétique ───────────────────────────────

const ClientProfileCard: React.FC<{
  client: ClientProfile;
  rdvId: number;
  isAssigned: boolean;
  onAssign: (rdvId: number) => void;
  onStatusChange: (assignmentId: number, status: string) => void;
  assignmentId?: number | null;
  assignmentStatus?: string | null;
}> = ({ client, rdvId, isAssigned, onAssign, onStatusChange, assignmentId, assignmentStatus }) => {
  const p = client.user.profile || {};
  const [statusOpen, setStatusOpen] = useState(false);

  const statusOptions = ['assigned', 'contacted', 'completed', 'cancelled'];

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Header client */}
      <div className="bg-white rounded-[2rem] border border-slate-100 p-6 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary-500 to-indigo-500 text-white flex items-center justify-center font-black text-xl">
              {client.user.firstName?.[0]?.toUpperCase() || '?'}
            </div>
            <div>
              <h3 className="font-black text-xl text-slate-900">{client.user.firstName} {client.user.lastName}</h3>
              <p className="text-sm text-slate-500">{client.user.email}</p>
            </div>
          </div>
          <div className="flex flex-col items-end gap-2">
            <StatusBadge status={assignmentStatus || null} />
            {!isAssigned ? (
              <button
                onClick={() => onAssign(rdvId)}
                className="px-5 py-2.5 bg-primary-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-primary-700 transition-all"
              >
                Prendre en charge
              </button>
            ) : (
              <div className="relative">
                <button
                  onClick={() => setStatusOpen(o => !o)}
                  className="flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-700 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-200 transition-all"
                >
                  Changer statut <ChevronDown className="w-3 h-3" />
                </button>
                {statusOpen && (
                  <div className="absolute right-0 mt-1 bg-white border border-slate-200 rounded-2xl shadow-xl z-10 min-w-[180px] overflow-hidden">
                    {statusOptions.map(s => {
                      const opt = STATUS_MAP[s];
                      const Icon = opt.icon;
                      return (
                        <button
                          key={s}
                          onClick={() => { if (assignmentId) onStatusChange(assignmentId, s); setStatusOpen(false); }}
                          className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition-colors text-left"
                        >
                          <Icon className="w-4 h-4 text-slate-500" />
                          <span className="text-xs font-bold text-slate-700">{opt.label}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Profil synthétique */}
      {Object.keys(p).length > 0 && (
        <div className="bg-white rounded-[2rem] border border-slate-100 p-6">
          <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-4 flex items-center gap-2">
            <UserIcon className="w-3 h-3" /> Profil
          </h4>
          <div className="grid grid-cols-2 gap-3">
            {p.adultsCount && (
              <div className="flex items-center gap-2 text-sm text-slate-700">
                <Users className="w-4 h-4 text-primary-400" />
                <span>{p.adultsCount} adulte{p.adultsCount > 1 ? 's' : ''}</span>
              </div>
            )}
            {p.childrenCount > 0 && (
              <div className="flex items-center gap-2 text-sm text-slate-700">
                <Baby className="w-4 h-4 text-primary-400" />
                <span>{p.childrenCount} enfant{p.childrenCount > 1 ? 's' : ''}</span>
              </div>
            )}
            {p.postalCode && (
              <div className="flex items-center gap-2 text-sm text-slate-700">
                <MapPin className="w-4 h-4 text-primary-400" />
                <span>{p.postalCode}</span>
              </div>
            )}
            {p.housingStatus && (
              <div className="flex items-center gap-2 text-sm text-slate-700">
                <Building2 className="w-4 h-4 text-primary-400" />
                <span className="capitalize">{p.housingStatus}</span>
              </div>
            )}
            {p.workStatus && (
              <div className="flex items-center gap-2 text-sm text-slate-700">
                <Briefcase className="w-4 h-4 text-primary-400" />
                <span className="capitalize">{p.workStatus}</span>
              </div>
            )}
            {p.monthlyIncome && (
              <div className="flex items-center gap-2 text-sm text-slate-700">
                <Euro className="w-4 h-4 text-primary-400" />
                <span>{p.monthlyIncome.toLocaleString('fr-FR')} € / mois</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Contrats */}
      <div className="bg-white rounded-[2rem] border border-slate-100 p-6">
        <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-4 flex items-center gap-2">
          <ClipboardList className="w-3 h-3" /> Contrats ({client.policies.length})
        </h4>
        {client.policies.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-4">Aucun contrat enregistré</p>
        ) : (
          <div className="space-y-3">
            {client.policies.map(pol => {
              const meta = typeof pol.metadata === 'string' ? JSON.parse(pol.metadata || '{}') : pol.metadata || {};
              const TypeIcon = getPolicyIcon(pol.insurance_type_code);
              return (
                <div key={pol.id} className="flex items-center gap-3 p-4 bg-slate-50 rounded-2xl">
                  <div className="w-10 h-10 rounded-xl bg-primary-50 text-primary-600 flex items-center justify-center flex-shrink-0">
                    <TypeIcon className="w-5 h-5" />
                  </div>
                  {pol.insurer_logo && (
                    <img src={pol.insurer_logo} alt={pol.insurer_label} className="h-7 object-contain flex-shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-sm text-slate-900 truncate">{meta.name || pol.insurer_label || 'Contrat'}</p>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[10px] text-slate-500 font-medium">{pol.insurer_label}</span>
                      {(meta.formula || meta.coverageDetail) && (
                        <span className="text-[9px] font-black text-primary-600 bg-primary-50 px-2 py-0.5 rounded-full uppercase">
                          <Zap className="w-2.5 h-2.5 inline mr-0.5" />
                          {meta.formula || meta.coverageDetail}
                        </span>
                      )}
                      {meta.annualPremium && (
                        <span className="text-[9px] font-bold text-emerald-600">
                          <Euro className="w-2.5 h-2.5 inline" />{meta.annualPremium}/an
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

// ─── Composant principal ──────────────────────────────────────────────────────

const PartnerDashboard: React.FC = () => {
  const [tab, setTab] = useState<'requests' | 'mine'>('requests');
  const [rdvRequests, setRdvRequests] = useState<RdvRequest[]>([]);
  const [myAssignments, setMyAssignments] = useState<RdvRequest[]>([]);
  const [selectedRdv, setSelectedRdv] = useState<RdvRequest | null>(null);
  const [clientProfile, setClientProfile] = useState<ClientProfile | null>(null);
  const [loadingRequests, setLoadingRequests] = useState(false);
  const [loadingClient, setLoadingClient] = useState(false);
  const [error, setError] = useState('');

  const apiFetch = useCallback(async (path: string, options?: RequestInit) => {
    const csrfResp = await fetch(`${API_URL}/api/csrf-token`, { credentials: 'include' });
    const { csrfToken } = await csrfResp.json();
    return fetch(`${API_URL}${path}`, {
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrfToken },
      ...options,
    });
  }, []);

  const loadRequests = useCallback(async () => {
    setLoadingRequests(true);
    setError('');
    try {
      const r = await apiFetch('/api/partner/rdv-requests');
      if (!r.ok) throw new Error(await r.text());
      const data: RdvRequest[] = await r.json();
      setRdvRequests(data);
    } catch (e: any) {
      setError('Impossible de charger les demandes de RDV');
    } finally {
      setLoadingRequests(false);
    }
  }, [apiFetch]);

  const loadMyAssignments = useCallback(async () => {
    try {
      const r = await apiFetch('/api/partner/my-assignments');
      if (r.ok) setMyAssignments(await r.json());
    } catch {}
  }, [apiFetch]);

  useEffect(() => {
    loadRequests();
    loadMyAssignments();
  }, [loadRequests, loadMyAssignments]);

  const loadClientProfile = async (rdv: RdvRequest) => {
    setSelectedRdv(rdv);
    setClientProfile(null);
    setLoadingClient(true);
    try {
      const r = await apiFetch(`/api/partner/client/${encodeURIComponent(rdv.user_email)}`);
      if (!r.ok) throw new Error();
      setClientProfile(await r.json());
    } catch {
      setError('Impossible de charger le profil client');
    } finally {
      setLoadingClient(false);
    }
  };

  const handleAssign = async (rdvId: number) => {
    try {
      const r = await apiFetch('/api/partner/assign', {
        method: 'POST',
        body: JSON.stringify({ rdvId }),
      });
      if (r.ok) {
        await loadRequests();
        await loadMyAssignments();
        // Recharger le profil pour rafraîchir le statut
        if (selectedRdv) await loadClientProfile(selectedRdv);
      }
    } catch {
      setError('Erreur lors de la prise en charge');
    }
  };

  const handleStatusChange = async (assignmentId: number, status: string) => {
    try {
      await apiFetch(`/api/partner/assignment/${assignmentId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      await loadRequests();
      await loadMyAssignments();
    } catch {
      setError('Erreur lors du changement de statut');
    }
  };

  const displayList = tab === 'requests' ? rdvRequests : myAssignments;

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex items-center justify-between px-2">
        <div>
          <h2 className="text-3xl font-black text-slate-900">Espace Partenaire</h2>
          <p className="text-slate-500 text-sm mt-1">Gestion des dossiers clients</p>
        </div>
        <button
          onClick={() => { loadRequests(); loadMyAssignments(); }}
          className="p-2.5 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-all"
          title="Rafraîchir"
        >
          {loadingRequests ? <Loader2 className="w-4 h-4 animate-spin text-primary-600" /> : <RefreshCw className="w-4 h-4 text-slate-500" />}
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-3 px-4 py-3 bg-red-50 border border-red-100 rounded-2xl text-red-600 text-sm">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Onglets */}
      <div className="flex gap-2 bg-slate-100 p-1 rounded-2xl">
        <button
          onClick={() => setTab('requests')}
          className={`flex-1 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${tab === 'requests' ? 'bg-white text-primary-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
        >
          Demandes de RDV ({rdvRequests.length})
        </button>
        <button
          onClick={() => setTab('mine')}
          className={`flex-1 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${tab === 'mine' ? 'bg-white text-primary-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
        >
          Mes dossiers ({myAssignments.length})
        </button>
      </div>

      {/* Liste des RDV + panneau détail */}
      <div className="grid grid-cols-1 gap-4">

        {/* Sélecteur client */}
        <div className="bg-white rounded-[2rem] border border-slate-100 overflow-hidden">
          <div className="p-4 border-b border-slate-100 bg-slate-50">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
              {tab === 'requests' ? 'Sélectionnez un client' : 'Vos dossiers assignés'}
            </p>
          </div>

          {loadingRequests ? (
            <div className="py-12 flex items-center justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-primary-600" />
            </div>
          ) : displayList.length === 0 ? (
            <div className="py-12 text-center">
              <BarChart2 className="w-10 h-10 text-slate-200 mx-auto mb-3" />
              <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">
                {tab === 'requests' ? 'Aucune demande' : 'Aucun dossier'}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-50">
              {displayList.map(rdv => {
                const isSelected = selectedRdv?.id === rdv.id;
                const clientName = rdv.first_name
                  ? `${rdv.first_name} ${rdv.last_name || ''}`.trim()
                  : rdv.user_email;

                return (
                  <button
                    key={rdv.id}
                    onClick={() => loadClientProfile(rdv)}
                    className={`w-full flex items-center gap-4 px-5 py-4 text-left transition-all hover:bg-slate-50 ${isSelected ? 'bg-primary-50 border-l-4 border-primary-500' : ''}`}
                  >
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary-100 to-indigo-100 text-primary-600 flex items-center justify-center font-black text-base flex-shrink-0">
                      {(rdv.first_name?.[0] || rdv.user_email[0]).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-slate-900 truncate">{clientName}</p>
                      <div className="flex items-center gap-2 flex-wrap mt-0.5">
                        <span className="text-[9px] text-slate-400 font-medium flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {rdv.day || 'Date non définie'}
                        </span>
                        {rdv.slot && (
                          <span className="text-[9px] text-slate-400 font-medium flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {rdv.slot}
                          </span>
                        )}
                        <StatusBadge status={rdv.assignment_status} />
                      </div>
                    </div>
                    <ChevronRight className={`w-4 h-4 flex-shrink-0 transition-transform ${isSelected ? 'text-primary-500 rotate-90' : 'text-slate-300'}`} />
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Panneau détail client */}
        {selectedRdv && (
          <div>
            {loadingClient ? (
              <div className="py-12 flex flex-col items-center justify-center gap-3">
                <Loader2 className="w-7 h-7 animate-spin text-primary-600" />
                <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">Chargement du dossier…</p>
              </div>
            ) : clientProfile ? (
              <ClientProfileCard
                client={clientProfile}
                rdvId={selectedRdv.id}
                isAssigned={!!selectedRdv.assignment_id}
                assignmentId={selectedRdv.assignment_id}
                assignmentStatus={selectedRdv.assignment_status}
                onAssign={handleAssign}
                onStatusChange={handleStatusChange}
              />
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
};

export default PartnerDashboard;
