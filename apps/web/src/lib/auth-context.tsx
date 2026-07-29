"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { AuthResponse, PublicUser } from "@nyps-forum/shared";
import { api } from "./api";

interface AuthContextValue {
  user: PublicUser | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, displayName: string) => Promise<void>;
  /** Used by OAuth (Google/Apple) flows, which get a token+user from a different endpoint. */
  setSession: (token: string, user: PublicUser) => void;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const STORAGE_KEY = "nyps-forum:token";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = useCallback(async (activeToken?: string | null) => {
    const t = activeToken ?? token;
    if (!t) {
      setUser(null);
      return;
    }
    try {
      const res = await api.get<{ user: PublicUser }>("/api/auth/me", t);
      setUser(res.user);
    } catch {
      setUser(null);
      setToken(null);
      localStorage.removeItem(STORAGE_KEY);
    }
  }, [token]);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      setToken(stored);
      api
        .get<{ user: PublicUser }>("/api/auth/me", stored)
        .then((res) => setUser(res.user))
        .catch(() => {
          localStorage.removeItem(STORAGE_KEY);
          setToken(null);
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await api.post<AuthResponse>("/api/auth/login", { email, password });
    localStorage.setItem(STORAGE_KEY, res.token);
    setToken(res.token);
    setUser(res.user);
  }, []);

  const signup = useCallback(async (email: string, password: string, displayName: string) => {
    const res = await api.post<AuthResponse>("/api/auth/signup", { email, password, displayName });
    localStorage.setItem(STORAGE_KEY, res.token);
    setToken(res.token);
    setUser(res.user);
  }, []);

  const setSession = useCallback((newToken: string, newUser: PublicUser) => {
    localStorage.setItem(STORAGE_KEY, newToken);
    setToken(newToken);
    setUser(newUser);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setToken(null);
    setUser(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ user, token, loading, login, signup, setSession, logout, refreshUser: () => refreshUser() }),
    [user, token, loading, login, signup, setSession, logout, refreshUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
