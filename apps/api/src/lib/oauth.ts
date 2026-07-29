/**
 * Google / Apple sign-in. Both follow the same pattern: the client obtains an
 * identity token directly from Google's or Apple's own SDK (never from us),
 * POSTs it here, and we verify the token's signature or content server-side
 * before trusting it. We never see the user's Google/Apple password — only a
 * short-lived, provider-signed assertion of who they are.
 *
 * Neither provider works without real credentials, and unlike identity
 * verification there's no vendor-hosted "mock" we can point at locally — a
 * Google/Apple ID token can only ever be minted by Google/Apple. So instead,
 * `isGoogleConfigured()` / `isAppleConfigured()` gate the real verification
 * path, and when neither is configured the API exposes a dev-only
 * `/api/auth/oauth/dev-mock` route (see routes/auth.ts) that skips real
 * verification entirely, purely so the sign-up/sign-in UX can be built and
 * demoed before you've set up Google Cloud / Apple Developer accounts.
 *
 * To go to production:
 *
 *   Google: console.cloud.google.com -> APIs & Services -> Credentials.
 *   Create an OAuth 2.0 Client ID of type "Web application" (for the Next.js
 *   app) and, separately, one of type "iOS" (for the Expo app, using its
 *   bundle identifier). Set GOOGLE_WEB_CLIENT_ID / GOOGLE_IOS_CLIENT_ID here,
 *   and NEXT_PUBLIC_GOOGLE_CLIENT_ID (the web one) in apps/web/.env.local.
 *
 *   Apple: developer.apple.com -> Certificates, IDs & Profiles. Create a
 *   Services ID (for "Sign in with Apple JS" on web) with your web domain and
 *   redirect URL registered, and make sure your app's Bundle ID has the
 *   "Sign In with Apple" capability enabled. Set APPLE_SERVICES_ID /
 *   APPLE_BUNDLE_ID here, and NEXT_PUBLIC_APPLE_SERVICES_ID in
 *   apps/web/.env.local.
 */

import { OAuth2Client } from "google-auth-library";
import appleSignin from "apple-signin-auth";

export function isGoogleConfigured(): boolean {
  return Boolean(process.env.GOOGLE_WEB_CLIENT_ID || process.env.GOOGLE_IOS_CLIENT_ID);
}

export function isAppleConfigured(): boolean {
  return Boolean(process.env.APPLE_SERVICES_ID || process.env.APPLE_BUNDLE_ID);
}

export function oauthConfig() {
  return {
    google: {
      enabled: isGoogleConfigured(),
      webClientId: process.env.GOOGLE_WEB_CLIENT_ID ?? null,
      iosClientId: process.env.GOOGLE_IOS_CLIENT_ID ?? null,
    },
    apple: {
      enabled: isAppleConfigured(),
      servicesId: process.env.APPLE_SERVICES_ID ?? null,
    },
  };
}

interface OAuthIdentity {
  providerId: string;
  email: string;
  name: string | null;
}

const googleClient = new OAuth2Client();

export async function verifyGoogleIdToken(idToken: string): Promise<OAuthIdentity> {
  const audience = [process.env.GOOGLE_WEB_CLIENT_ID, process.env.GOOGLE_IOS_CLIENT_ID].filter(
    (v): v is string => Boolean(v),
  );
  const ticket = await googleClient.verifyIdToken({ idToken, audience });
  const payload = ticket.getPayload();
  if (!payload?.sub || !payload.email) {
    throw new Error("Google token did not include the expected user info");
  }
  return { providerId: payload.sub, email: payload.email, name: payload.name ?? null };
}

export async function verifyAppleIdToken(identityToken: string): Promise<OAuthIdentity> {
  const audience = [process.env.APPLE_SERVICES_ID, process.env.APPLE_BUNDLE_ID].filter(
    (v): v is string => Boolean(v),
  );
  const payload = await appleSignin.verifyIdToken(identityToken, { audience });
  return { providerId: payload.sub, email: payload.email, name: null };
}
