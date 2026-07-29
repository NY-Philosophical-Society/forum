import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import type { AuthResponse } from "@nyps-forum/shared";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth-context";
import { useSettings } from "../lib/settings-context";
import type { ThemeColors } from "../lib/theme";
import type { RootStackParamList } from "../navigation";

type Props = NativeStackScreenProps<RootStackParamList, "MockOAuth">;

/**
 * Stands in for Google's / Apple's own hosted sign-in screen. A real
 * integration never shows this — the provider's native SDK handles it and
 * this app only ever receives the resulting identity token. Exists purely so
 * the sign-up/sign-in UX can be tried without real OAuth credentials (see
 * apps/api/src/lib/oauth.ts).
 */
export function MockOAuthScreen({ route }: Props) {
  const { provider } = route.params;
  const { setSession } = useAuth();
  const { colors } = useSettings();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const providerLabel = provider === "apple" ? "Apple" : "Google";

  async function onSubmit() {
    setError(null);
    setSubmitting(true);
    try {
      const res = await api.post<AuthResponse>("/api/auth/oauth/dev-mock", {
        provider,
        email,
        displayName,
      });
      // No further navigation needed — the root navigator swaps to the app
      // stack automatically once the session is set.
      setSession(res.token, res.user);
    } catch (err: any) {
      setError(err.message ?? "Could not sign in");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.h1}>Mock {providerLabel} Sign-In</Text>
      <Text style={styles.notice}>
        This screen exists only because real {providerLabel} sign-in isn&apos;t configured on
        this server yet.
      </Text>
      <Text style={styles.label}>Name (as {providerLabel} would provide it)</Text>
      <TextInput style={styles.input} value={displayName} onChangeText={setDisplayName} />
      <Text style={styles.label}>Email</Text>
      <TextInput
        style={styles.input}
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      {error && <Text style={styles.error}>{error}</Text>}
      <Pressable style={styles.button} onPress={onSubmit} disabled={submitting}>
        <Text style={styles.buttonText}>
          {submitting ? "Signing in..." : `Continue as this ${providerLabel} user`}
        </Text>
      </Pressable>
    </View>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.paper, padding: 16 },
    h1: { fontSize: 20, fontWeight: "700", color: colors.ink, marginBottom: 8 },
    notice: {
      backgroundColor: colors.pendingBg,
      color: colors.pendingText,
      padding: 10,
      borderRadius: 6,
      marginBottom: 12,
      fontSize: 13,
    },
    label: { fontWeight: "700", color: colors.ink, marginTop: 8, marginBottom: 4 },
    input: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 6,
      padding: 10,
      backgroundColor: colors.surface,
      color: colors.ink,
    },
    error: { color: colors.danger, marginTop: 8 },
    button: {
      backgroundColor: colors.solid,
      paddingVertical: 12,
      borderRadius: 6,
      alignItems: "center",
      marginTop: 16,
    },
    buttonText: { color: colors.solidText, fontWeight: "700" },
  });
}
