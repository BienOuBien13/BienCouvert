// -----------------------------------------------------------------------------
// Service d'accès aux polices (API client)
// - Fournit des fonctions pour lister, créer, mettre à jour et supprimer des
//   polices en appelant les endpoints du backend (`/api/policies`).
// - Gère l'envoi de fichiers via FormData et ajoute les entêtes d'auth si
//   l'utilisateur est connecté.
// -----------------------------------------------------------------------------
import { Policy } from '../types';
import { authService } from './authService';

const API_BASE = (import.meta.env.VITE_API_BASE_URL as string) || (typeof window !== 'undefined' ? `${window.location.protocol}//${window.location.hostname}:4000` : 'http://localhost:4000');

export const storageService = {
  getPolicies: async (userId: string): Promise<Policy[]> => {
    const res = await fetch(`${API_BASE}/api/policies?userId=${encodeURIComponent(userId)}`);
    if (!res.ok) throw new Error('Failed to fetch policies');
    return res.json();
  },

  savePolicy: async (policy: Omit<Policy, 'userId'> & { userId?: string; file?: File | null }) => {
    const token = authService.getToken();
    // Construction du FormData pour supporter upload fichier et champs textuels
    const fd = new FormData();
    fd.append('name', policy.name);
    fd.append('provider', policy.provider);
    fd.append('type', policy.type as string);
    if (policy.coverageDetail) fd.append('coverageDetail', policy.coverageDetail);
    if (policy.sourceUrl) fd.append('sourceUrl', policy.sourceUrl);
    if (policy.summary) fd.append('summary', policy.summary);
    if (policy.mimeType) fd.append('mimeType', policy.mimeType);
    fd.append('userId', policy.userId || 'anonymous');
    // Si un File est fourni (upload multipart), on l'ajoute directement
    if ((policy as any).file) fd.append('file', (policy as any).file as File);
    // Support pour chemins alternatifs où le client fournit déjà du base64
    if ((policy as any).fileData) fd.append('fileData', (policy as any).fileData as string);
    if ((policy as any).fileName) fd.append('fileName', (policy as any).fileName as string);

    const res = await fetch(`${API_BASE}/api/policies`, { method: 'POST', body: fd, headers: token ? { Authorization: `Bearer ${token}` } : undefined });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.message || 'Failed to save policy');
    }
    return res.json();
  },

  updatePolicy: async (policy: Policy & { file?: File | null }) => {
    const token = authService.getToken();
    // Similaire à savePolicy : on prépare un FormData et on envoie en PUT
    const fd = new FormData();
    fd.append('name', policy.name);
    fd.append('provider', policy.provider);
    fd.append('type', policy.type as string);
    if (policy.coverageDetail) fd.append('coverageDetail', policy.coverageDetail);
    if (policy.sourceUrl) fd.append('sourceUrl', policy.sourceUrl);
    if (policy.summary) fd.append('summary', policy.summary);
    if (policy.mimeType) fd.append('mimeType', policy.mimeType);
    if (policy.file) fd.append('file', policy.file as File);

    if ((policy as any).fileData) fd.append('fileData', (policy as any).fileData as string);
    if ((policy as any).fileName) fd.append('fileName', (policy as any).fileName as string);
    const res = await fetch(`${API_BASE}/api/policies/${policy.id}`, { method: 'PUT', body: fd, headers: token ? { Authorization: `Bearer ${token}` } : undefined });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.message || 'Failed to update policy');
    }
    return res.json();
  },

  deletePolicy: async (policyId: string) => {
    const token = authService.getToken();
    const res = await fetch(`${API_BASE}/api/policies/${policyId}`, { method: 'DELETE', headers: token ? { Authorization: `Bearer ${token}` } : undefined });
    if (!res.ok) throw new Error('Failed to delete policy');
    return res.json();
  }
};