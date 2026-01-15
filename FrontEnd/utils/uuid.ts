// =============================================================================
// GÉNÉRATEUR D'UUID v4 (Universally Unique Identifier)
// Utilisé côté client pour générer des identifiants uniques pour les polices,
// messages, et autres entités nécessitant un ID unique.
// 
// Méthodes supportées (par ordre de préférence) :
// 1. crypto.randomUUID() - API native moderne (Node.js 15+, navigateurs récents)
// 2. crypto.getRandomValues() - Génération conforme RFC4122 v4
// 3. Math.random() - Fallback pour environnements anciens (moins sécurisé)
// =============================================================================

/**
 * Génère un UUID v4 aléatoire.
 * Utilise les APIs crypto natives quand disponibles pour assurer la qualité
 * aléatoire, sinon utilise Math.random() en dernier recours.
 * 
 * Format UUID v4 : xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
 * où x est hexadécimal et y est 8, 9, A ou B
 * 
 * @returns UUID v4 sous forme de chaîne (ex: "f47ac10b-58cc-4372-a567-0e02b2c3d479")
 */
export function uuid(): string {
  try {
    // Méthode 1 : Utilisation de l'API native crypto.randomUUID (la plus simple)
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }

    // Méthode 2 : Génération manuelle avec crypto.getRandomValues (conforme RFC4122)
    if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
      const bytes = new Uint8Array(16);
      crypto.getRandomValues(bytes);
      
      // Application du format UUID v4 selon RFC4122
      bytes[6] = (bytes[6] & 0x0f) | 0x40;  // Version 4
      bytes[8] = (bytes[8] & 0x3f) | 0x80;  // Variant
      
      // Conversion en chaîne hexadécimale avec formatage UUID
      const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
      return `${hex.substr(0,8)}-${hex.substr(8,4)}-${hex.substr(12,4)}-${hex.substr(16,4)}-${hex.substr(20,12)}`;
    }
    
    // Méthode 3 : Fallback Math.random
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  } catch (e) {
    // Fallback d'urgence
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }
}
