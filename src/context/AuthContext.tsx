import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { User, Wallet, Package, WebsiteSettings, AdminUser } from '../types';
import { apiRequest, getToken, setToken, removeToken, getDeviceFingerprint } from '../lib/api';

interface AuthContextType {
  user: User | null;
  admin: AdminUser | null;
  isAdmin: boolean;
  wallet: Wallet | null;
  activePackage: Package | null;
  settings: WebsiteSettings | null;
  isLoading: boolean;
  unreadCount: number;
  login: (phone: string, password: string, rememberMe?: boolean) => Promise<any>;
  register: (phone: string, password: string, referralCode?: string, fp?: string) => Promise<any>;
  logout: () => Promise<void>;
  refreshUserData: () => Promise<void>;
  decrementUnread: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [admin, setAdmin] = useState<AdminUser | null>(null);
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [activePackage, setActivePackage] = useState<Package | null>(null);
  const [settings, setSettings] = useState<WebsiteSettings | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [unreadCount, setUnreadCount] = useState<number>(0);

  const fetchPublicSettings = useCallback(async () => {
    try {
      const data = await apiRequest('/api/settings/public');
      if (data && data.settings) {
        setSettings(data.settings);
      } else if (data && !data.error) {
        setSettings(data);
      }
    } catch {
      // ignore
    }
  }, []);

  const refreshUserData = useCallback(async () => {
    const token = getToken();
    if (!token) {
      setUser(null);
      setAdmin(null);
      setIsAdmin(false);
      setWallet(null);
      setActivePackage(null);
      return;
    }

    try {
      const data = await apiRequest('/api/auth/me');
      if (data.isAdmin) {
        setIsAdmin(true);
        setAdmin(data.admin);
        setUser(null);
      } else {
        setIsAdmin(false);
        setAdmin(null);
        setUser(data.user || null);
        setWallet(data.wallet || null);
        setActivePackage(data.activePackage || null);

        // Fetch unread count for user
        try {
          const notifs = await apiRequest('/api/notifications');
          if (Array.isArray(notifs)) {
            setUnreadCount(notifs.filter((n: any) => !n.isRead).length);
          } else if (notifs && Array.isArray(notifs.notifications)) {
            setUnreadCount(notifs.notifications.filter((n: any) => !n.isRead).length);
          }
        } catch {
          // ignore
        }
      }
    } catch {
      removeToken();
      setUser(null);
      setAdmin(null);
      setIsAdmin(false);
      setWallet(null);
      setActivePackage(null);
    }
  }, []);

  useEffect(() => {
    const initAuth = async () => {
      setIsLoading(true);
      await Promise.allSettled([fetchPublicSettings(), refreshUserData()]);
      setIsLoading(false);
    };
    initAuth();
  }, [fetchPublicSettings, refreshUserData]);

  const login = async (phone: string, password: string) => {
    const fp = getDeviceFingerprint();
    const res = await apiRequest('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ phone, password, deviceFingerprint: fp }),
    });

    if (res.token) {
      setToken(res.token);
    }

    if (res.isAdmin) {
      setIsAdmin(true);
      setAdmin(res.admin);
      setUser(null);
      setWallet(null);
      setActivePackage(null);
    } else {
      setIsAdmin(false);
      setAdmin(null);
      setUser(res.user);
      setWallet(res.wallet);
      if (res.activePackage) {
        setActivePackage(res.activePackage);
      }
    }

    return res;
  };

  const register = async (phone: string, password: string, referralCode?: string, fp?: string) => {
    const deviceFingerprint = fp || getDeviceFingerprint();
    const res = await apiRequest('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ phone, password, referralCode, deviceFingerprint }),
    });

    if (res.token) {
      setToken(res.token);
    }

    setIsAdmin(false);
    setAdmin(null);
    setUser(res.user);
    setWallet(res.wallet);

    return res;
  };

  const logout = async () => {
    try {
      await apiRequest('/api/auth/logout', { method: 'POST' });
    } catch {
      // ignore
    } finally {
      removeToken();
      setUser(null);
      setAdmin(null);
      setIsAdmin(false);
      setWallet(null);
      setActivePackage(null);
    }
  };

  const decrementUnread = () => {
    setUnreadCount(prev => Math.max(0, prev - 1));
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        admin,
        isAdmin,
        wallet,
        activePackage,
        settings,
        isLoading,
        unreadCount,
        login,
        register,
        logout,
        refreshUserData,
        decrementUnread,
      }}
    >
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
