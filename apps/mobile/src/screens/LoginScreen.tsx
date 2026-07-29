import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useAuth } from "../lib/auth-context";
import { useSettings } from "../lib/settings-context";
import { fonts, radius, spacing, type, type ThemeColors } from "../lib/theme";
import type { AuthStackParamList } from "../navigation";
import { OAuthButtons } from "../components/OAuthButtons";

type Props = NativeStackScreenProps<AuthStackParamList, "Login">;

export function LoginScreen({ navigation }: Props) {
  const { login } = useAuth();
  const { colors } = useSettings();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit() {
    setError(null);
    setSubmitting(true);
    try {
      // Once `login` resolves the root navigator swaps to the app tabs.
      await login(email, password);
    } catch (err: any) {
      setError(err.message ?? "Login failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.mark}>
        <Text style={styles.markText}>Φ</Text>
      </View>
      <Text style={styles.h1}>Log in to NYPS Forum</Text>
      <Text style={styles.subtitle}>A real-name space for philosophical argument.</Text>

      <OAuthButtons navigation={navigation} />

      <Text style={styles.label}>Email</Text>
      <TextInput
        style={styles.input}
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <Text style={styles.label}>Password</Text>
      <TextInput style={styles.input} secureTextEntry value={password} onChangeText={setPassword} />
      {error && <Text style={styles.error}>{error}</Text>}
      <Pressable style={styles.button} onPress={onSubmit} disabled={submitting}>
        <Text style={styles.buttonText}>{submitting ? "Logging in..." : "Log in"}</Text>
      </Pressable>
      <Pressable style={styles.linkRow} onPress={() => navigation.navigate("ForgotPassword")}>
        <Text style={styles.linkText}>Forgot your password?</Text>
      </Pressable>
      <Pressable style={styles.linkRow} onPress={() => navigation.navigate("Signup")}>
        <Text style={styles.linkText}>Don&apos;t have an account? Sign up</Text>
      </Pressable>
      <Pressable style={styles.linkRow} onPress={() => navigation.navigate("Settings")}>
        <Text style={styles.linkTextMuted}>Settings</Text>
      </Pressable>
    </ScrollView>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.paper },
    content: { padding: spacing.xl },
    mark: {
      width: 48,
      height: 48,
      borderRadius: radius.md,
      backgroundColor: colors.solid,
      alignItems: "center",
      justifyContent: "center",
      alignSelf: "center",
      marginBottom: spacing.lg,
    },
    markText: { color: colors.solidText, fontFamily: fonts.serifBold, fontSize: type.lg },
    h1: {
      fontFamily: fonts.serifBold,
      fontSize: type.xl,
      color: colors.ink,
      textAlign: "center",
      marginBottom: spacing.xs,
    },
    subtitle: {
      fontFamily: fonts.display,
      fontSize: type.sm,
      color: colors.muted,
      textAlign: "center",
      marginBottom: spacing.xl,
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
    linkRow: { marginTop: spacing.lg, alignItems: "center" },
    linkText: { color: colors.accent, fontFamily: fonts.displayMedium, fontSize: type.sm },
    linkTextMuted: { color: colors.muted, fontFamily: fonts.display, fontSize: type.sm },
  });
}
