"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.storage = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
// -----------------------------------------------------------------------------
// Stockage local - prototypage
// Ce module expose des fonctions simples pour lire/écrire des tableaux JSON
// dans des fichiers locaux. Les fichiers sont créés automatiquement si
// inexistants. Ces fonctions ne doivent pas être utilisées telles quelles en
// production (pas de verrouillage, pas de transactions, pas d'audit, etc.).
// -----------------------------------------------------------------------------
const DATA_DIR = path_1.default.join(__dirname, '..', 'data');
const USERS_FILE = path_1.default.join(DATA_DIR, 'users.json');
const POLICIES_FILE = path_1.default.join(DATA_DIR, 'policies.json');
/**
 * Vérifie que le dossier de données existe et crée des fichiers JSON vides
 * (`[]`) si nécessaire. Appelée avant chaque opération de lecture/écriture.
 */
function ensureDataDir() {
    if (!fs_1.default.existsSync(DATA_DIR))
        fs_1.default.mkdirSync(DATA_DIR);
    if (!fs_1.default.existsSync(USERS_FILE))
        fs_1.default.writeFileSync(USERS_FILE, '[]');
    if (!fs_1.default.existsSync(POLICIES_FILE))
        fs_1.default.writeFileSync(POLICIES_FILE, '[]');
}
exports.storage = {
    /**
     * Lit la liste des utilisateurs depuis `BackEnd/data/users.json`.
     * Retourne un tableau d'objets typés génériquement.
     */
    readUsers: () => {
        ensureDataDir();
        const raw = fs_1.default.readFileSync(USERS_FILE, 'utf-8');
        return JSON.parse(raw);
    },
    /**
     * Écrit la liste des utilisateurs dans `BackEnd/data/users.json`.
     * La sortie est formatée avec 2 espaces pour rester lisible.
     */
    writeUsers: (data) => {
        ensureDataDir();
        fs_1.default.writeFileSync(USERS_FILE, JSON.stringify(data, null, 2));
    },
    /**
     * Lit la liste des polices depuis `BackEnd/data/policies.json`.
     */
    readPolicies: () => {
        ensureDataDir();
        const raw = fs_1.default.readFileSync(POLICIES_FILE, 'utf-8');
        return JSON.parse(raw);
    },
    /**
     * Écrit la liste des polices dans `BackEnd/data/policies.json`.
     */
    writePolicies: (data) => {
        ensureDataDir();
        fs_1.default.writeFileSync(POLICIES_FILE, JSON.stringify(data, null, 2));
    }
};
