import * as AuthSession from "expo-auth-session";
import * as WebBrowser from "expo-web-browser";
import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSettings } from "../lib/settings-context";
import { supabase } from "../lib/supabase";
import { fonts, radius, spacing, type, type ThemeColors } from "../lib/theme";

WebBrowser.maybeCompleteAuthSession();

/**
 * Google and Apple sign-in, brokered by Supabase.
 *
 * This used to drive each provider directly — expo-auth-session against
 * Google's endpoints, expo-apple-authentication for Apple, and a mock screen
 * when neither had credentials. Supabase runs the provider flow now, so the
 * app only opens the authorize URL and hands the returned tokens back to
 * supabase-js. Configure providers under [auth.external] in
 * supabase/config.toml, or in the hosted project's dashboard.
 *
 * The redirect scheme is declared in app.json and allow-listed in
 * config.toml's additional_redirect_urls; the flow silently fails to come back
 * if those disagree.
 */
export function OAuthButtons() {
  const { colors } = useSettings();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [error, setError] = useState<string | null>(null);

  async function signInWith(provider: "google" | "apple") {
    setError(null);
    const redirectTo = AuthSession.makeRedirectUri({ scheme: "nypsforum", path: "auth-callback" });
    const { data, error: startError } = await supabase.auth.signInWithOAuth({
      provider,
      // Without this supabase-js redirects the (non-existent) page itself
      // instead of handing us a URL to open in the browser.
      options: { redirectTo, skipBrowserRedirect: true },
    });
    if (startError || !data.url) {
      setError(startError?.message ?? "Could not start sign-in");
      return;
    }

    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
    if (result.type !== "success") return; // user dismissed the sheet

    // Supabase returns the session in the callback URL's fragment; there is no
    // URL for supabase-js to read in React Native, so set it explicitly.
    const params = new URLSearchParams(result.url.split("#")[1] ?? "");
    const access_token = params.get("access_token");
    const refresh_token = params.get("refresh_token");
    if (!access_token || !refresh_token) {
      setError(params.get("error_description") ?? "Sign-in did not complete");
      return;
    }
    const { error: sessionError } = await supabase.auth.setSession({ access_token, refresh_token });
    if (sessionError) setError(sessionError.message);
    // On success the root navigator swaps to the app tabs, driven by
    // onAuthStateChange in AuthProvider.
  }

  return (
    <View style={{ marginBottom: spacing.lg }}>
      {error && <Text style={styles.error}>{error}</Text>}
      <Pressable style={styles.button} onPress={() => signInWith("google")}>
        <Text style={styles.buttonText}>Continue with Google</Text>
      </Pressable>
      <Pressable style={styles.button} onPress={() => signInWith("apple")}>
        <Text style={styles.buttonText}>Continue with Apple</Text>
      </Pressable>
      <Text style={styles.divider}>─  or continue with email  ─</Text>
    </View>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    button: {
      borderWidth: 1,
      borderColor: colors.borderStrong,
      backgroundColor: colors.surface,
      borderRadius: radius.sm,
      paddingVertical: spacing.md,
      alignItems: "center",
      marginBottom: spacing.sm,
    },
    buttonText: { color: colors.ink, fontFamily: fonts.displaySemi, fontSize: type.base },
    error: { color: colors.danger, fontFamily: fonts.sans, marginBottom: spacing.sm },
    divider: {
      textAlign: "center",
      color: colors.muted,
      fontFamily: fonts.sans,
      fontSize: type.xs,
      marginVertical: spacing.md,
      letterSpacing: 1,
      textTransform: "uppercase",
    },
  });
}
