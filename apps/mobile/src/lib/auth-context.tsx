import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { AuthResponse, PublicUser } from "@nyps-forum/shared";
import { api } from "./api";
import { deregisterPush } from "./push";

interface AuthContextValue {
  user: PublicUser | null;
  token: string | null;
  loading: boolean;
  /** Set when an OAuth sign-in just attached a provider to an existing account. */
  linkedNotice: boolean;
  clearLinkedNotice: () => void;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, displayName: string) => Promise<void>;
  /** Used by OAuth (Google/Apple) flows, which get a token+user from a different endpoint. */
  setSession: (token: string, user: PublicUser, linked?: boolean) => void;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);
const STORAGE_KEY = "nyps-forum:token";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [linkedNotice, setLinkedNotice] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then(async (stored) => {
      if (!stored) {
        setLoading(false);
        return;
      }
      setToken(stored);
      try {
        const res = await api.get<{ user: PublicUser }>("/api/auth/me", stored);
        setUser(res.user);
      } catch {
        await AsyncStorage.removeItem(STORAGE_KEY);
        setToken(null);
      } finally {
        setLoading(false);
      }
    });
  }, []);

  const refreshUser = useCallback(async () => {
    if (!token) return;
    const res = await api.get<{ user: PublicUser }>("/api/auth/me", token);
    setUser(res.user);
  }, [token]);

  const login = useCallback(async (email: string, password: string) => {
    const res = await api.post<AuthResponse>("/api/auth/login", { email, password });
    await AsyncStorage.setItem(STORAGE_KEY, res.token);
    setToken(res.token);
    setUser(res.user);
  }, []);

  const signup = useCallback(async (email: string, password: string, displayName: string) => {
    const res = await api.post<AuthResponse>("/api/auth/signup", { email, password, displayName });
    await AsyncStorage.setItem(STORAGE_KEY, res.token);
    setToken(res.token);
    setUser(res.user);
  }, []);

  const setSession = useCallback((newToken: string, newUser: PublicUser, linked?: boolean) => {
    AsyncStorage.setItem(STORAGE_KEY, newToken);
    setToken(newToken);
    setUser(newUser);
    if (linked) setLinkedNotice(true);
  }, []);

  const clearLinkedNotice = useCallback(() => setLinkedNotice(false), []);

  const logout = useCallback(() => {
    // Best-effort: revoke this device's push token while the session can
    // still authenticate the DELETE. Fire-and-forget — never blocks logout.
    if (token) deregisterPush(token);
    AsyncStorage.removeItem(STORAGE_KEY);
    setToken(null);
    setUser(null);
  }, [token]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      token,
      loading,
      linkedNotice,
      clearLinkedNotice,
      login,
      signup,
      setSession,
      logout,
      refreshUser,
    }),
    [user, token, loading, linkedNotice, clearLinkedNotice, login, signup, setSession, logout, refreshUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
