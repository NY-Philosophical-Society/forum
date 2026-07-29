import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput } from "react-native";
import type { AuthResponse } from "@nyps-forum/shared";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth-context";
import { useSettings } from "../lib/settings-context";
import { fonts, radius, spacing, type, type ThemeColors } from "../lib/theme";
import type { AuthStackParamList } from "../navigation";

type Props = NativeStackScreenProps<AuthStackParamList, "MockOAuth">;

/**
 * Stands in for Google's / Apple's own hosted sign-in screen. A real
 * integration never shows this — the provider's native SDK handles it and
 * this app only ever receives the resulting identity token.
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
      // The root navigator swaps to the app tabs once the session is set.
      setSession(res.token, res.user, res.linked);
    } catch (err: any) {
      setError(err.message ?? "Could not sign in");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: spacing.xl }}>
      <Text style={styles.notice}>
        Real {providerLabel} sign-in isn&apos;t configured on this server — in production this is
        {" "}
        {providerLabel}&apos;s own hosted screen.
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
    </ScrollView>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.paper },
    notice: {
      backgroundColor: colors.pendingBg,
      color: colors.pendingText,
      fontFamily: fonts.display,
      fontSize: type.sm,
      padding: spacing.md,
      borderRadius: radius.sm,
      marginBottom: spacing.lg,
      lineHeight: 20,
    },
    label: {
      fontFamily: fonts.displaySemi,
      fontSize: type.sm,
      color: colors.ink,
      marginBottom: spacing.xs,
      marginTop: spacing.sm,
    },
    input: {
      borderWidth: 1,
      borderColor: colors.borderStrong,
      borderRadius: radius.sm,
      padding: spacing.md,
      backgroundColor: colors.surface,
      color: colors.ink,
      fontFamily: fonts.serif,
      fontSize: type.base,
    },
    error: { color: colors.danger, fontFamily: fonts.display, marginTop: spacing.sm },
    button: {
      backgroundColor: colors.solid,
      paddingVertical: spacing.md,
      borderRadius: radius.sm,
      alignItems: "center",
      marginTop: spacing.lg,
    },
    buttonText: { color: colors.solidText, fontFamily: fonts.displaySemi, fontSize: type.base },
  });
}
