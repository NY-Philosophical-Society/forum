"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { AuthResponse, OAuthConfig } from "@nyps-forum/shared";
import { api } from "~/lib/api";
import { useAuth } from "~/lib/auth-context";

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (opts: { client_id: string; callback: (r: { credential: string }) => void }) => void;
          renderButton: (el: HTMLElement, opts: Record<string, unknown>) => void;
        };
      };
    };
    AppleID?: {
      auth: {
        init: (opts: { clientId: string; scope: string; redirectURI: string; usePopup: boolean }) => void;
        signIn: () => Promise<{
          authorization: { id_token: string };
          user?: { name?: { firstName?: string; lastName?: string } };
        }>;
      };
    };
  }
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.body.appendChild(script);
  });
}

function afterAuth(res: AuthResponse, router: ReturnType<typeof useRouter>) {
  router.push(res.linked ? "/?linked=1" : "/");
}

/**
 * Real Google Identity Services / Sign in with Apple JS integration when the
 * server has real credentials configured; otherwise falls back to a local
 * mock flow so the sign-up/sign-in UX can be tried without a Google Cloud /
 * Apple Developer account. See apps/api/src/lib/oauth.ts for what "real"
 * requires.
 */
export function OAuthButtons() {
  const { setSession } = useAuth();
  const router = useRouter();
  const [config, setConfig] = useState<OAuthConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const googleButtonRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.get<OAuthConfig>("/api/auth/oauth/config").then(setConfig).catch(() => {});
  }, []);

  useEffect(() => {
    if (!config?.google.enabled || !config.google.webClientId || !googleButtonRef.current) return;
    let cancelled = false;
    loadScript("https://accounts.google.com/gsi/client").then(() => {
      if (cancelled || !window.google || !googleButtonRef.current) return;
      window.google.accounts.id.initialize({
        client_id: config.google.webClientId!,
        callback: async (response) => {
          try {
            const res = await api.post<AuthResponse>("/api/auth/oauth/google", {
              idToken: response.credential,
            });
            setSession(res.token, res.user);
            afterAuth(res, router);
          } catch (err: any) {
            setError(err.message ?? "Google sign-in failed");
          }
        },
      });
      window.google.accounts.id.renderButton(googleButtonRef.current, {
        theme: "outline",
        size: "large",
        width: "100%",
      });
    });
    return () => {
      cancelled = true;
    };
  }, [config, router, setSession]);

  async function signInWithApple() {
    if (!config?.apple.servicesId) return;
    try {
      await loadScript(
        "https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js",
      );
      window.AppleID!.auth.init({
        clientId: config.apple.servicesId,
        scope: "name email",
        redirectURI: window.location.origin,
        usePopup: true,
      });
      const response = await window.AppleID!.auth.signIn();
      const name = response.user?.name
        ? `${response.user.name.firstName ?? ""} ${response.user.name.lastName ?? ""}`.trim()
        : undefined;
      const res = await api.post<AuthResponse>("/api/auth/oauth/apple", {
        identityToken: response.authorization.id_token,
        displayName: name || undefined,
      });
      setSession(res.token, res.user);
      afterAuth(res, router);
    } catch (err: any) {
      setError(err.message ?? "Apple sign-in failed");
    }
  }

  if (!config) return null;

  return (
    <div>
      {error && <p className="error">{error}</p>}

      {config.google.enabled ? (
        <div ref={googleButtonRef} style={{ marginBottom: "0.5rem" }} />
      ) : (
        <button type="button" className="oauth-button" onClick={() => router.push("/oauth/mock/google")}>
          Continue with Google <span className="meta">(demo mode)</span>
        </button>
      )}

      {config.apple.enabled ? (
        <button type="button" className="oauth-button" onClick={signInWithApple}>
          Continue with Apple
        </button>
      ) : (
        <button type="button" className="oauth-button" onClick={() => router.push("/oauth/mock/apple")}>
          Continue with Apple <span className="meta">(demo mode)</span>
        </button>
      )}

      {(!config.google.enabled || !config.apple.enabled) && (
        <p className="meta" style={{ marginTop: "0.25rem" }}>
          Real Google/Apple sign-in isn&apos;t configured on this server yet — using a local demo
          flow instead.
        </p>
      )}

      <div className="auth-divider">or continue with email</div>
    </div>
  );
}
