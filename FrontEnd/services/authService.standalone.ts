// =============================================================================
// SERVICE D'AUTHENTIFICATION (MODE STANDALONE)
// Version locale utilisant localStorage uniquement, sans backend.
// À utiliser uniquement pour des démonstrations ou tests locaux.
// =============================================================================

import { User, UserProfileData } from '../types';
import { uuid } from '../utils/uuid';

const USERS_KEY = 'assurclair_users';
const SESSION_KEY = 'assurclair_session';

interface StoredUser extends User {
  password: string;
}

export const authService = {
  login: (email: string, password: string): User => {
    const usersStr = localStorage.getItem(USERS_KEY);
    const users: StoredUser[] = usersStr ? JSON.parse(usersStr) : [];
    const user = users.find(u => u.email.toLowerCase() === email.toLowerCase() && u.password === password);
    if (!user) throw new Error("Email ou mot de passe incorrect.");
    
    const sessionUser: User = { 
      id: user.id, 
      email: user.email, 
      name: user.name,
      profile: user.profile,
      isAdmin: user.isAdmin
    };
    localStorage.setItem(SESSION_KEY, JSON.stringify(sessionUser));
    return sessionUser;
  },

  register: (email: string, password: string): User => {
    const usersStr = localStorage.getItem(USERS_KEY);
    const users: StoredUser[] = usersStr ? JSON.parse(usersStr) : [];
    if (users.find(u => u.email.toLowerCase() === email.toLowerCase())) {
      throw new Error("Cet email est déjà utilisé.");
    }
    const displayName = email.split('@')[0]
      .split('.')
      .map(part => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');

    const newUser: StoredUser = { 
      id: uuid(), 
      name: displayName, 
      email, 
      password, 
      isAdmin: true 
    };
    users.push(newUser);
    localStorage.setItem(USERS_KEY, JSON.stringify(users));
    const sessionUser: User = { 
      id: newUser.id, 
      email: newUser.email, 
      name: newUser.name, 
      isAdmin: true 
    };
    localStorage.setItem(SESSION_KEY, JSON.stringify(sessionUser));
    return sessionUser;
  },

  resetPassword: (email: string, newPassword: string): void => {
    const usersStr = localStorage.getItem(USERS_KEY);
    const users: StoredUser[] = usersStr ? JSON.parse(usersStr) : [];
    const index = users.findIndex(u => u.email.toLowerCase() === email.toLowerCase());
    if (index === -1) throw new Error("Aucun compte associé à cet email.");
    users[index].password = newPassword;
    localStorage.setItem(USERS_KEY, JSON.stringify(users));
  },

  updateUser: (userId: string, data: { name: string; email: string; password?: string, profile?: UserProfileData }): User => {
    const usersStr = localStorage.getItem(USERS_KEY);
    const users: StoredUser[] = usersStr ? JSON.parse(usersStr) : [];
    const userIndex = users.findIndex(u => u.id === userId);
    if (userIndex === -1) throw new Error("Utilisateur non trouvé.");
    
    const updatedUser: StoredUser = {
      ...users[userIndex],
      name: data.name,
      email: data.email,
      password: data.password ? data.password : users[userIndex].password,
      profile: data.profile || users[userIndex].profile
    };
    
    users[userIndex] = updatedUser;
    localStorage.setItem(USERS_KEY, JSON.stringify(users));
    
    const sessionUser: User = { 
      id: updatedUser.id, 
      email: updatedUser.email, 
      name: updatedUser.name,
      profile: updatedUser.profile,
      isAdmin: updatedUser.isAdmin
    };
    localStorage.setItem(SESSION_KEY, JSON.stringify(sessionUser));
    return sessionUser;
  },

  logout: () => localStorage.removeItem(SESSION_KEY),
  getCurrentUser: (): User | null => {
    const sessionStr = localStorage.getItem(SESSION_KEY);
    return sessionStr ? JSON.parse(sessionStr) : null;
  }
};
