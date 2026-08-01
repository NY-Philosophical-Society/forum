import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { PublicUser } from "@nyps-forum/shared";
import { api } from "./api";
import { deregisterPush } from "./push";
import { supabase } from "./supabase";

/**
 * Identity is Supabase's; the account is ours.
 *
 * supabase-js owns the session — persisting it to AsyncStorage, refreshing it
 * before expiry, and reporting changes. Everything downstream of `token` is
 * unchanged: screens call our API with a bearer token, and `user` still comes
 * from GET /api/auth/me, which applies the ban check and returns forum state
 * (role, membership, verification) that Supabase knows nothing about.
 */
interface AuthContextValue {
  user: PublicUser | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, displayName: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadUser = useCallback(async (activeToken: string | null) => {
    if (!activeToken) {
      setUser(null);
      return;
    }
    try {
      const res = await api.get<{ user: PublicUser }>("/api/auth/me", activeToken);
      setUser(res.user);
    } catch {
      // A valid Supabase session whose forum account is banned or deleted.
      setUser(null);
    }
  }, []);

  useEffect(() => {
    // Fires immediately with the restored session (or null), and again on every
    // sign-in, sign-out and token refresh.
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      const nextToken = session?.access_token ?? null;
      setToken(nextToken);
      void loadUser(nextToken).finally(() => setLoading(false));
    });
    return () => data.subscription.unsubscribe();
  }, [loadUser]);

  const login = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message);
  }, []);

  const signup = useCallback(async (email: string, password: string, displayName: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      // Read by the API when it creates the forum account on the first
      // authenticated request. Real names are the point of this forum.
      options: { data: { display_name: displayName } },
    });
    if (error) throw new Error(error.message);
  }, []);

  const logout = useCallback(async () => {
    // Best-effort: revoke this device's push token while the session can still
    // authenticate the DELETE. Fire-and-forget — never blocks logout.
    if (token) deregisterPush(token);
    await supabase.auth.signOut();
  }, [token]);

  const refreshUser = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    await loadUser(data.session?.access_token ?? null);
  }, [loadUser]);

  const value = useMemo<AuthContextValue>(
    () => ({ user, token, loading, login, signup, logout, refreshUser }),
    [user, token, loading, login, signup, logout, refreshUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
