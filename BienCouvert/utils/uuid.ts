// utils/uuid.ts — Copié depuis FrontEnd/utils/uuid.ts (même logique)
// Synchronisé via scripts/sync-mobile.js

export function uuid(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
      const bytes = new Uint8Array(16);
      crypto.getRandomValues(bytes);
      bytes[6] = (bytes[6] & 0x0f) | 0x40;
      bytes[8] = (bytes[8] & 0x3f) | 0x80;
      const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
      return `${hex.substr(0,8)}-${hex.substr(8,4)}-${hex.substr(12,4)}-${hex.substr(16,4)}-${hex.substr(20,12)}`;
    }
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  } catch {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }
}
