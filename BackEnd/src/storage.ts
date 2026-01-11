import fs from 'fs';
import path from 'path';

// -----------------------------------------------------------------------------
// Module de stockage local - Prototypage
// Ce module expose des fonctions simples pour lire/écrire des tableaux JSON
// dans des fichiers locaux. Les fichiers sont créés automatiquement si inexistants.
// 
// ⚠️ ATTENTION : Ces fonctions ne doivent PAS être utilisées telles quelles en production !
// Limitations :
// - Pas de verrouillage de fichiers (risque de corruption en accès concurrent)
// - Pas de transactions (impossible de faire un rollback en cas d'erreur)
// - Pas d'audit trail (historique des modifications)
// - Pas de performances optimisées pour de gros volumes
// - Pas de sauvegarde automatique
// 
// Pour la production, utiliser une vraie base de données (PostgreSQL, MongoDB, etc.)
// -----------------------------------------------------------------------------

// Chemins des fichiers de stockage
const DATA_DIR = path.join(__dirname, '..', 'data');                // Dossier data/ à la racine du backend
const USERS_FILE = path.join(DATA_DIR, 'users.json');              // Liste des utilisateurs avec mots de passe hachés
const POLICIES_FILE = path.join(DATA_DIR, 'policies.json');        // Liste des polices d'assurance
const CENTRAL_CG_FILE = path.join(DATA_DIR, 'central_cg.json');    // Référentiel central des CG

/**
 * Vérifie que le dossier de données existe et initialise les fichiers JSON.
 * Crée le dossier data/ s'il n'existe pas, puis crée chaque fichier JSON
 * avec un tableau vide ([]) s'ils n'existent pas déjà.
 * Cette fonction est appelée avant chaque opération de lecture/écriture
 * pour garantir que l'infrastructure de stockage est prête.
 */
function ensureDataDir() {
  // Création du dossier data/ si nécessaire
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
  
  // Initialisation des fichiers JSON avec des tableaux vides
  if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, '[]');
  if (!fs.existsSync(POLICIES_FILE)) fs.writeFileSync(POLICIES_FILE, '[]');
  if (!fs.existsSync(CENTRAL_CG_FILE)) fs.writeFileSync(CENTRAL_CG_FILE, '[]');
}

export const storage = {
  /**
   * Lit la liste des utilisateurs depuis `BackEnd/data/users.json`.
   * Chaque utilisateur contient : id, email, name, password (haché), profile, isAdmin.
   * @returns Tableau d'objets utilisateur typés génériquement
   */
  readUsers: <T = any>(): T[] => {
    ensureDataDir();
    const raw = fs.readFileSync(USERS_FILE, 'utf-8');
    return JSON.parse(raw) as T[];
  },

  /**
   * Écrit la liste des utilisateurs dans `BackEnd/data/users.json`.
   * La sortie est formatée avec 2 espaces d'indentation pour rester lisible.
   * @param data - Tableau d'utilisateurs à sauvegarder
   */
  writeUsers: (data: any[]) => {
    ensureDataDir();
    fs.writeFileSync(USERS_FILE, JSON.stringify(data, null, 2));
  },

  /**
   * Lit la liste des polices d'assurance depuis `BackEnd/data/policies.json`.
   * Chaque police contient les informations du contrat et le document associé.
   * @returns Tableau d'objets police typés génériquement
   */
  readPolicies: <T = any>(): T[] => {
    ensureDataDir();
    const raw = fs.readFileSync(POLICIES_FILE, 'utf-8');
    return JSON.parse(raw) as T[];
  },

  /**
   * Écrit la liste des polices dans `BackEnd/data/policies.json`.
   * Formaté avec indentation pour faciliter le débogage.
   * @param data - Tableau de polices à sauvegarder
   */
  writePolicies: (data: any[]) => {
    ensureDataDir();
    fs.writeFileSync(POLICIES_FILE, JSON.stringify(data, null, 2));
  },

  /**
   * Lit le référentiel central des Conditions Générales depuis `BackEnd/data/central_cg.json`.
   * Ce référentiel contient les CG indexées de différents assureurs pour faciliter
   * la recherche et éviter les uploads redondants.
   * @returns Tableau d'entrées CG typées génériquement
   */
  readCentralCg: <T = any>(): T[] => {
    ensureDataDir();
    const raw = fs.readFileSync(CENTRAL_CG_FILE, 'utf-8');
    return JSON.parse(raw) as T[];
  },

  /**
   * Écrit le référentiel central des CG dans `BackEnd/data/central_cg.json`.
   * Formaté avec indentation pour faciliter la gestion manuelle si nécessaire.
   * @param data - Tableau d'entrées CG à sauvegarder
   */
  writeCentralCg: (data: any[]) => {
    ensureDataDir();
    fs.writeFileSync(CENTRAL_CG_FILE, JSON.stringify(data, null, 2));
  }
};