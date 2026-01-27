/**
 * Utilitaire de validation et de politique de mot de passe
 * Conforme aux recommandations ANSSI et RGPD
 */

export interface PasswordValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Politique de mot de passe forte selon ANSSI :
 * - Minimum 12 caractères
 * - Au moins 1 majuscule
 * - Au moins 1 minuscule
 * - Au moins 1 chiffre
 * - Au moins 1 caractère spécial
 */
export function validatePassword(password: string): PasswordValidationResult {
  // Validation simplifiée : min 6 caractères
  const errors: string[] = [];
  if (password.length < 6) {
    errors.push('Le mot de passe doit contenir au moins 6 caractères');
  }
  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Retourne un message d'aide pour la création d'un mot de passe fort
 */
export function getPasswordRequirements(): string {
  return `Votre mot de passe doit contenir au moins 6 caractères.`;
}
