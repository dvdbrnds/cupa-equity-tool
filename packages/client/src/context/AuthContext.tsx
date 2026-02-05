import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import type { User, AuthSession } from '@cupa/shared';
import { authApi } from '@/services/api';

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refreshSession = useCallback(async () => {
    try {
      const session = await authApi.getSession();
      setUser(session.user);
      setError(null);
    } catch {
      setUser(null);
    }
  }, []);

  useEffect(() => {
    const initAuth = async () => {
      try {
        await refreshSession();
      } finally {
        setIsLoading(false);
      }
    };
    initAuth();
  }, [refreshSession]);

  const login = async (email: string, password: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const session: AuthSession = await authApi.login(email, password);
      setUser(session.user);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Login failed';
      setError(message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    try {
      await authApi.logout();
    } finally {
      setUser(null);
    }
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, error, login, logout, refreshSession }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
