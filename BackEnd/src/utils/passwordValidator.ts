/**
 * Utilitaire de validation et de politique de mot de passe
 * Conforme aux recommandations ANSSI et RGPD
 */

export interface PasswordValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Politique de mot de passe simplifiée :
 * - Minimum 6 caractères
 * - Au moins 1 majuscule
 * - Au moins 1 caractère spécial
 */
export function validatePassword(password: string): PasswordValidationResult {
  const errors: string[] = [];

  // Longueur minimale de 6 caractères
  if (password.length < 6) {
    errors.push('Le mot de passe doit contenir au moins 6 caractères');
  }

  // Au moins une majuscule
  if (!/[A-Z]/.test(password)) {
    errors.push('Le mot de passe doit contenir au moins une majuscule');
  }

  // Au moins un caractère spécial
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
    errors.push('Le mot de passe doit contenir au moins un caractère spécial (!@#$%^&*...)');
  }

  // Vérification des patterns faibles communs
  const weakPatterns = [
    /^(.)\1+$/,           // Tous les caractères identiques (ex: "aaaaaaaaaa")
    /^(012|123|234|345|456|567|678|789|890)+/i,  // Séquences numériques
    /^(abc|bcd|cde|def|efg|fgh)+/i,              // Séquences alphabétiques
    /password/i,          // Contient "password"
    /motdepasse/i,        // Contient "motdepasse"
    /azerty/i,            // Contient "azerty"
    /qwerty/i,            // Contient "qwerty"
    /admin/i              // Contient "admin"
  ];

  for (const pattern of weakPatterns) {
    if (pattern.test(password)) {
      errors.push('Le mot de passe contient un pattern trop simple');
      break;
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Retourne un message d'aide pour la création d'un mot de passe
 */
export function getPasswordRequirements(): string {
  return `Votre mot de passe doit respecter les critères suivants :
• Au moins 6 caractères
• Au moins une lettre majuscule (A-Z)
• Au moins un caractère spécial (!@#$%^&*...)`;
}
