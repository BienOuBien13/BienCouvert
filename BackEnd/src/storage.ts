import fs from 'fs';
import path from 'path';

const DATA_DIR = path.join(__dirname, '..', 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const POLICIES_FILE = path.join(DATA_DIR, 'policies.json');

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
  if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, '[]');
  if (!fs.existsSync(POLICIES_FILE)) fs.writeFileSync(POLICIES_FILE, '[]');
}

export const storage = {
  readUsers: <T = any>(): T[] => {
    ensureDataDir();
    const raw = fs.readFileSync(USERS_FILE, 'utf-8');
    return JSON.parse(raw) as T[];
  },
  writeUsers: (data: any[]) => {
    ensureDataDir();
    fs.writeFileSync(USERS_FILE, JSON.stringify(data, null, 2));
  },
  readPolicies: <T = any>(): T[] => {
    ensureDataDir();
    const raw = fs.readFileSync(POLICIES_FILE, 'utf-8');
    return JSON.parse(raw) as T[];
  },
  writePolicies: (data: any[]) => {
    ensureDataDir();
    fs.writeFileSync(POLICIES_FILE, JSON.stringify(data, null, 2));
  }
};