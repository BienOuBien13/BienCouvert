import fs from 'fs';
import path from 'path';

// -----------------------------------------------------------------------------
// Stockage local - prototypage
// Ce module expose des fonctions simples pour lire/écrire des tableaux JSON
// dans des fichiers locaux. Les fichiers sont créés automatiquement si
// inexistants. Ces fonctions ne doivent pas être utilisées telles quelles en
// production (pas de verrouillage, pas de transactions, pas d'audit, etc.).
// -----------------------------------------------------------------------------

const DATA_DIR = path.join(__dirname, '..', 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const POLICIES_FILE = path.join(DATA_DIR, 'policies.json');

/**
 * Vérifie que le dossier de données existe et crée des fichiers JSON vides
 * (`[]`) si nécessaire. Appelée avant chaque opération de lecture/écriture.
 */
function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
  if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, '[]');
  if (!fs.existsSync(POLICIES_FILE)) fs.writeFileSync(POLICIES_FILE, '[]');
}

export const storage = {
  /**
   * Lit la liste des utilisateurs depuis `BackEnd/data/users.json`.
   * Retourne un tableau d'objets typés génériquement.
   */
  readUsers: <T = any>(): T[] => {
    ensureDataDir();
    const raw = fs.readFileSync(USERS_FILE, 'utf-8');
    return JSON.parse(raw) as T[];
  },

  /**
   * Écrit la liste des utilisateurs dans `BackEnd/data/users.json`.
   * La sortie est formatée avec 2 espaces pour rester lisible.
   */
  writeUsers: (data: any[]) => {
    ensureDataDir();
    fs.writeFileSync(USERS_FILE, JSON.stringify(data, null, 2));
  },

  /**
   * Lit la liste des polices depuis `BackEnd/data/policies.json`.
   */
  readPolicies: <T = any>(): T[] => {
    ensureDataDir();
    const raw = fs.readFileSync(POLICIES_FILE, 'utf-8');
    return JSON.parse(raw) as T[];
  },

  /**
   * Écrit la liste des polices dans `BackEnd/data/policies.json`.
   */
  writePolicies: (data: any[]) => {
    ensureDataDir();
    fs.writeFileSync(POLICIES_FILE, JSON.stringify(data, null, 2));
  }
};