import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';

const TOKEN_KEY = 'acquis_dash_token';
const BASE      = import.meta.env.VITE_API_BASE_URL ?? '';

interface AuthState {
  token:           string | null;
  email:           string | null;
  isAuthenticated: boolean;
  isLoading:       boolean;
}

interface AuthContextValue extends AuthState {
  login:  (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    token: null, email: null, isAuthenticated: false, isLoading: true,
  });

  const validateToken = useCallback(async (token: string) => {
    try {
      const res = await fetch(`${BASE}/api/v1/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setState({ token, email: data.email, isAuthenticated: true, isLoading: false });
        return;
      }
    } catch { /* network error — fall through */ }
    localStorage.removeItem(TOKEN_KEY);
    setState({ token: null, email: null, isAuthenticated: false, isLoading: false });
  }, []);

  // On mount: restore session from localStorage
  useEffect(() => {
    const stored = localStorage.getItem(TOKEN_KEY);
    if (stored) {
      validateToken(stored);
    } else {
      setState(s => ({ ...s, isLoading: false }));
    }
  }, [validateToken]);

  const login = useCallback(async (email: string, password: string) => {
    const res = await fetch(`${BASE}/api/v1/auth/login`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error ?? 'Login failed');
    }
    const { token } = await res.json();
    localStorage.setItem(TOKEN_KEY, token);
    setState({ token, email, isAuthenticated: true, isLoading: false });
  }, []);

  const logout = useCallback(async () => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (token) {
      fetch(`${BASE}/api/v1/auth/logout`, {
        method:  'POST',
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => { /* best-effort */ });
    }
    localStorage.removeItem(TOKEN_KEY);
    setState({ token: null, email: null, isAuthenticated: false, isLoading: false });
  }, []);

  return (
    <AuthContext.Provider value={{ ...state, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
