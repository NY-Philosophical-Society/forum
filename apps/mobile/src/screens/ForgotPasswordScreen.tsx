import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput } from "react-native";
import { useSettings } from "../lib/settings-context";
import { supabase } from "../lib/supabase";
import { fonts, radius, spacing, type, type ThemeColors } from "../lib/theme";
import type { AuthStackParamList } from "../navigation";

type Props = NativeStackScreenProps<AuthStackParamList, "ForgotPassword">;

/**
 * Password reset, run by Supabase.
 *
 * The app has no web page for a reset link to land on, so this uses the
 * emailed one-time code instead: verifyOtp exchanges it for a short-lived
 * session, and updateUser then sets the new password. That means the recovery
 * email template MUST include {{ .Token }} — see supabase/config.toml, and the
 * matching template in the hosted project's dashboard.
 */
export function ForgotPasswordScreen({ navigation }: Props) {
  const { colors } = useSettings();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [email, setEmail] = useState("");
  const [requested, setRequested] = useState(false);
  const [token, setToken] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function request() {
    setError(null);
    setBusy(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email);
    setBusy(false);
    if (error && /rate limit/i.test(error.message)) {
      setError("Too many attempts just now. Try again in a few minutes.");
      return;
    }
    // Any other error is swallowed deliberately: whether an address has an
    // account here is not something this screen should confirm to a stranger.
    setRequested(true);
  }

  async function confirm() {
    setError(null);
    setBusy(true);
    try {
      const { error: otpError } = await supabase.auth.verifyOtp({
        email,
        token: token.trim(),
        type: "recovery",
      });
      if (otpError) throw new Error("That code is invalid or has expired.");
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw new Error(updateError.message);
      // verifyOtp leaves the app signed in; the reset screen should not double
      // as a back door into the account.
      await supabase.auth.signOut();
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
            If that email has an account, a reset code is on its way. Enter it here with your
            new password.
          </Text>
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
