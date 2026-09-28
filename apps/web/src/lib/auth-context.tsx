"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { PublicUser } from "@nyps-forum/shared";
import { api } from "./api";
import { classifyAccountLoadError, createLatestRequestGate, oauthRedirectUrl, type AuthLoadError } from "./auth-state";
import { supabase } from "./supabase";

/**
 * Identity is Supabase's; the account is ours.
 *
 * supabase-js owns the session — storing it, refreshing it before expiry, and
 * telling us when it changes. Everything downstream of `token` is unchanged
 * from when this app signed its own JWTs: screens still call our API with a
 * bearer token, and `user` still comes from GET /api/auth/me, which is what
 * applies the ban check and returns forum state (role, membership,
 * verification) that Supabase knows nothing about.
 */
interface AuthContextValue {
  user: PublicUser | null;
  sessionUserId: string | null;
  email: string | null;
  token: string | null;
  loading: boolean;
  error: AuthLoadError | null;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, displayName: string) => Promise<{ confirmationRequired: boolean }>;
  loginWithOAuth: (provider: "google" | "apple", redirectPath?: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [sessionUserId, setSessionUserId] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<AuthLoadError | null>(null);
  const requestGate = useRef(createLatestRequestGate());

  const loadUser = useCallback(async (activeToken: string | null) => {
    if (!activeToken) {
      requestGate.current.invalidate();
      setUser(null);
      setError(null);
      setLoading(false);
      return;
    }
    const ticket = requestGate.current.next();
    try {
      const res = await api.get<{ user: PublicUser }>("/api/auth/me", activeToken, { signal: ticket.signal });
      if (!ticket.isCurrent()) return;
      setUser(res.user);
      setError(null);
    } catch (loadError) {
      if (!ticket.isCurrent()) return;
      setUser(null);
      setError(classifyAccountLoadError(loadError));
    } finally {
      if (ticket.isCurrent()) setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Fires immediately with the restored session (or null), and again on every
    // sign-in, sign-out, and token refresh — so this one subscription covers
    // both start-up and later changes.
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      const nextToken = session?.access_token ?? null;
      const nextUserId = session?.user.id ?? null;
      setSessionUserId(nextUserId);
      setEmail(session?.user.email ?? null);
      setToken(nextToken);
      setError(null);
      setUser((current) => current?.id === nextUserId ? current : null);
      setLoading(Boolean(nextToken));
      void loadUser(nextToken);
    });
    return () => {
      requestGate.current.invalidate();
      data.subscription.unsubscribe();
    };
  }, [loadUser]);

  const login = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message);
  }, []);

  const signup = useCallback(async (email: string, password: string, displayName: string) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      // The API reads this when it creates the forum account on the first
      // authenticated request (middleware/auth.ts). Real names are the point
      // of this forum, so it must not be left to a fallback.
      options: { data: { display_name: displayName } },
    });
    if (error) throw new Error(error.message);
    return { confirmationRequired: !data.session };
  }, []);

  const loginWithOAuth = useCallback(async (
    provider: "google" | "apple",
    redirectPath = "/",
  ) => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: oauthRedirectUrl(redirectPath, window.location.origin) },
    });
    if (error) throw new Error(error.message);
  }, []);

  const logout = useCallback(async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw new Error(error.message);
  }, []);

  const refreshUser = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    setLoading(Boolean(data.session?.access_token));
    setError(null);
    await loadUser(data.session?.access_token ?? null);
  }, [loadUser]);

  const value = useMemo<AuthContextValue>(
    () => ({ user, sessionUserId, email, token, loading, error, login, signup, loginWithOAuth, logout, refreshUser }),
    [user, sessionUserId, email, token, loading, error, login, signup, loginWithOAuth, logout, refreshUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
