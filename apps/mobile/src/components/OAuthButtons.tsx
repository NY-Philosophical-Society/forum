import * as AppleAuthentication from "expo-apple-authentication";
import * as AuthSession from "expo-auth-session";
import * as WebBrowser from "expo-web-browser";
import { useEffect, useMemo, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import type { AuthResponse, OAuthConfig } from "@nyps-forum/shared";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth-context";
import { useSettings } from "../lib/settings-context";
import { fonts, radius, spacing, type, type ThemeColors } from "../lib/theme";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { AuthStackParamList } from "../navigation";

WebBrowser.maybeCompleteAuthSession();

const GOOGLE_DISCOVERY = {
  authorizationEndpoint: "https://accounts.google.com/o/oauth2/v2/auth",
  tokenEndpoint: "https://oauth2.googleapis.com/token",
};

// Public by nature (embedded in the app binary) — set once you've created an
// iOS OAuth client in Google Cloud Console. See apps/api/src/lib/oauth.ts.
const GOOGLE_IOS_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ?? "";

/**
 * Real Google (expo-auth-session) / Apple (expo-apple-authentication)
 * sign-in when the server has real credentials configured; otherwise routes
 * to a local mock screen. Apple Sign-In additionally requires a custom dev
 * client build (it isn't available in plain Expo Go) — see the README.
 */
export function OAuthButtons<RouteName extends keyof AuthStackParamList>({
  navigation,
}: {
  navigation: NativeStackNavigationProp<AuthStackParamList, RouteName>;
}) {
  const { setSession } = useAuth();
  const { colors } = useSettings();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [config, setConfig] = useState<OAuthConfig | null>(null);
  const [appleAvailable, setAppleAvailable] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<OAuthConfig>("/api/auth/oauth/config").then(setConfig).catch(() => {});
    if (Platform.OS === "ios") {
      AppleAuthentication.isAvailableAsync().then(setAppleAvailable);
    }
  }, []);

  const [, response, promptAsync] = AuthSession.useAuthRequest(
    {
      clientId: GOOGLE_IOS_CLIENT_ID || "unconfigured",
      scopes: ["openid", "profile", "email"],
      redirectUri: AuthSession.makeRedirectUri({ scheme: "nypsforum" }),
      responseType: AuthSession.ResponseType.IdToken,
      usePKCE: false,
    },
    GOOGLE_DISCOVERY,
  );

  useEffect(() => {
    if (response?.type === "success" && response.params.id_token) {
      api
        .post<AuthResponse>("/api/auth/oauth/google", { idToken: response.params.id_token })
        .then((res) => {
          // The root navigator swaps to the app tabs once the session is set.
          setSession(res.token, res.user, res.linked);
        })
        .catch((e) => setError(e.message ?? "Google sign-in failed"));
    }
  }, [response, setSession]);

  async function handleGoogle() {
    if (config?.google.enabled) {
      await promptAsync();
    } else {
      navigation.navigate("MockOAuth", { provider: "google" });
    }
  }

  async function handleApple() {
    if (config?.apple.enabled && appleAvailable) {
      try {
        const credential = await AppleAuthentication.signInAsync({
          requestedScopes: [
            AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
            AppleAuthentication.AppleAuthenticationScope.EMAIL,
          ],
        });
        const displayName = credential.fullName
          ? `${credential.fullName.givenName ?? ""} ${credential.fullName.familyName ?? ""}`.trim()
          : undefined;
        const res = await api.post<AuthResponse>("/api/auth/oauth/apple", {
          identityToken: credential.identityToken,
          displayName: displayName || undefined,
        });
        setSession(res.token, res.user, res.linked);
      } catch (e: any) {
        if (e.code !== "ERR_REQUEST_CANCELED") {
          setError(e.message ?? "Apple sign-in failed");
        }
      }
    } else {
      navigation.navigate("MockOAuth", { provider: "apple" });
    }
  }

  if (!config) return null;

  return (
    <View style={{ marginBottom: spacing.lg }}>
      {error && <Text style={styles.error}>{error}</Text>}
      <Pressable style={styles.button} onPress={handleGoogle}>
        <Text style={styles.buttonText}>
          Continue with Google{!config.google.enabled ? "  (demo)" : ""}
        </Text>
      </Pressable>
      <Pressable style={styles.button} onPress={handleApple}>
        <Text style={styles.buttonText}>
          Continue with Apple{!config.apple.enabled ? "  (demo)" : ""}
        </Text>
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
