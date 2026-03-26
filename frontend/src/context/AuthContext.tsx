import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';

type Role = 'admin' | 'manager' | 'employee';

interface User {
  business_id: number;
  username: string;
  business_name: string;
  role: Role;
  employee_id?: number;
  name?: string;
}

interface AuthContextType {
  token: string | null;
  user: User | null;
  role: Role | null;
  isAuthenticated: boolean;
  loading: boolean;
  login: (token: string) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const API = '/api';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => {
    return sessionStorage.getItem('shiftsync_token');
  });
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState<boolean>(!!sessionStorage.getItem('shiftsync_token'));

  const isAuthenticated = !!token && !!user;

  // Fetch user info whenever token changes
  useEffect(() => {
    if (token) {
      sessionStorage.setItem('shiftsync_token', token);
      fetchUser(token);
    } else {
      sessionStorage.removeItem('shiftsync_token');
      setUser(null);
      setLoading(false);
    }
  }, [token]);

  const fetchUser = async (t: string) => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/auth/me`, {
        headers: { Authorization: `Bearer ${t}` },
      });
      if (!res.ok) throw new Error('Token invalid');
      const data = await res.json();
      setUser(data);
    } catch {
      // Token is bad — clear it
      setToken(null);
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  const login = (newToken: string) => {
    setToken(newToken);
  };

  const logout = () => {
    setToken(null);
  };

  return (
    <AuthContext.Provider value={{ token, user, role: user?.role || null, isAuthenticated, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}