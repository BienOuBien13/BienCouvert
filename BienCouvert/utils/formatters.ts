// utils/formatters.ts — Utilitaires de formatage pour React Native

/**
 * Formate un montant en euros
 * Ex: formatCurrency(1234.5) → "1 234,50 €"
 */
export function formatCurrency(amount: number | undefined | null): string {
  if (amount == null) return '—';
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

/**
 * Formate un timestamp en date lisible
 * Ex: formatDate(1710000000000) → "09 mars 2024"
 */
export function formatDate(timestamp: number | undefined | null): string {
  if (!timestamp) return '—';
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(new Date(timestamp));
}

/**
 * Tronque un texte à une longueur max
 */
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + '…';
}

/**
 * Retourne les initiales d'un nom complet
 * Ex: "Jean Dupont" → "JD"
 */
export function initials(firstName: string, lastName: string): string {
  return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
}
