// hooks/useAuth.ts — State d'authentification global

import { useState, useEffect, useCallback } from 'react';
import { User } from '../types';
import { authService } from '../services/authService';
import { onSessionExpired } from '../services/api';
import { router, type Href } from 'expo-router';

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Chargement initial de l'utilisateur depuis SecureStore
  useEffect(() => {
    authService.getCurrentUser().then(u => {
      setUser(u);
      setIsLoading(false);
    });
  }, []);

  // Déconnexion automatique si session expirée côté API
  useEffect(() => {
    onSessionExpired(() => {
      setUser(null);
      router.replace('/(auth)/login' as Href);
    });
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const u = await authService.login(email, password);
    setUser(u);
    return u;
  }, []);

  const register = useCallback(async (email: string, password: string) => {
    const u = await authService.register(email, password);
    setUser(u);
    return u;
  }, []);

  const logout = useCallback(async () => {
    await authService.logout();
    setUser(null);
  }, []);

  const updateUser = useCallback((updated: User) => {
    setUser(updated);
  }, []);

  return { user, isLoading, login, register, logout, updateUser };
}
