import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput } from "react-native";
import { api } from "../lib/api";
import { useSettings } from "../lib/settings-context";
import { fonts, radius, spacing, type, type ThemeColors } from "../lib/theme";
import type { AuthStackParamList } from "../navigation";

type Props = NativeStackScreenProps<AuthStackParamList, "ForgotPassword">;

/**
 * On web the reset link lands in email (or, in dev, is returned directly).
 * On mobile we ask for the code from that link plus a new password, against
 * the same request/confirm endpoints.
 */
export function ForgotPasswordScreen({ navigation }: Props) {
  const { colors } = useSettings();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [email, setEmail] = useState("");
  const [requested, setRequested] = useState(false);
  const [devToken, setDevToken] = useState<string | null>(null);
  const [token, setToken] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function request() {
    setError(null);
    setBusy(true);
    try {
      const res = await api.post<{ message: string; devToken?: string }>(
        "/api/auth/password-reset/request",
        { email },
      );
      setRequested(true);
      setDevToken(res.devToken ?? null);
    } catch (err: any) {
      setError(err.message ?? "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    setError(null);
    setBusy(true);
    try {
      await api.post("/api/auth/password-reset/confirm", { token: token.trim(), password });
      setDone(true);
    } catch (err: any) {
      setError(err.message ?? "Could not reset your password");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: spacing.lg }}>
      {done ? (
        <>
          <Text style={styles.notice}>Your password has been reset.</Text>
          <Pressable style={styles.button} onPress={() => navigation.navigate("Login")}>
            <Text style={styles.buttonText}>Back to log in</Text>
          </Pressable>
        </>
      ) : !requested ? (
        <>
          <Text style={styles.copy}>
            Enter the email on your account and we&apos;ll send reset instructions.
          </Text>
          <Text style={styles.label}>Email</Text>
          <TextInput
            style={styles.input}
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
          />
          {error && <Text style={styles.error}>{error}</Text>}
          <Pressable style={styles.button} onPress={request} disabled={busy}>
            <Text style={styles.buttonText}>{busy ? "Sending..." : "Send reset code"}</Text>
          </Pressable>
        </>
      ) : (
        <>
          <Text style={styles.copy}>
            If that email has a password-based account, reset instructions are on their way.
            Enter the code here with a new password.
          </Text>
          {devToken && (
            <Text style={styles.meta}>
              No email service is configured on this server yet — dev code: {devToken}
            </Text>
          )}
          <Text style={styles.label}>Reset code</Text>
          <TextInput style={styles.input} autoCapitalize="none" value={token} onChangeText={setToken} />
          <Text style={styles.label}>New password</Text>
          <TextInput style={styles.input} secureTextEntry value={password} onChangeText={setPassword} />
          {error && <Text style={styles.error}>{error}</Text>}
          <Pressable style={styles.button} onPress={confirm} disabled={busy}>
            <Text style={styles.buttonText}>{busy ? "Resetting..." : "Reset password"}</Text>
          </Pressable>
        </>
      )}
    </ScrollView>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.paper },
    copy: {
      fontFamily: fonts.sans,
      fontSize: type.base,
      lineHeight: 24,
      color: colors.ink,
      marginBottom: spacing.lg,
    },
    meta: {
      fontFamily: fonts.sans,
      fontSize: type.sm,
      color: colors.muted,
      marginBottom: spacing.lg,
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
      fontFamily: fonts.sans,
      fontSize: type.base,
    },
    error: { color: colors.danger, fontFamily: fonts.sans, marginTop: spacing.sm },
    notice: {
      backgroundColor: colors.verifiedBg,
      color: colors.verifiedText,
      fontFamily: fonts.sans,
      padding: spacing.md,
      borderRadius: radius.sm,
      marginBottom: spacing.lg,
    },
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
