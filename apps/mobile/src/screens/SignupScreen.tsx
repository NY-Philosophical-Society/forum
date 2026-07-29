import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useMemo, useState } from "react";
import { Image, Pressable, ScrollView, StyleSheet, Text, TextInput } from "react-native";
import { useAuth } from "../lib/auth-context";
import { useSettings } from "../lib/settings-context";
import { fonts, radius, spacing, type, type ThemeColors } from "../lib/theme";
import type { AuthStackParamList } from "../navigation";
import { OAuthButtons } from "../components/OAuthButtons";

type Props = NativeStackScreenProps<AuthStackParamList, "Signup">;

export function SignupScreen({ navigation }: Props) {
  const { signup } = useAuth();
  const { colors } = useSettings();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit() {
    setError(null);
    setSubmitting(true);
    try {
      // Once `signup` resolves the root navigator swaps to the app tabs.
      await signup(email, password, displayName);
    } catch (err: any) {
      setError(err.message ?? "Signup failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Image
        source={require("../../assets/nypc-icon.png")}
        style={styles.mark}
        resizeMode="contain"
      />
      <Text style={styles.h1}>Create your account</Text>
      <Text style={styles.subtitle}>
        Posting under your real name asks for a one-time identity verification — do that whenever
        you&apos;re ready, from your profile.
      </Text>

      <OAuthButtons navigation={navigation} />

      <Text style={styles.label}>Full real name</Text>
      <TextInput
        style={styles.input}
        placeholder="Jane Doe"
        placeholderTextColor={colors.muted}
        value={displayName}
        onChangeText={setDisplayName}
      />
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
        <Text style={styles.buttonText}>
          {submitting ? "Creating account..." : "Create account"}
        </Text>
      </Pressable>
      <Pressable style={styles.linkRow} onPress={() => navigation.navigate("Login")}>
        <Text style={styles.linkText}>Already have an account? Log in</Text>
      </Pressable>
    </ScrollView>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.paper },
    content: { padding: spacing.xl },
    mark: {
      width: 64,
      height: 64,
      alignSelf: "center",
      marginBottom: spacing.lg,
    },
    h1: {
      fontFamily: fonts.serifBold,
      fontSize: type.xl,
      color: colors.ink,
      textAlign: "center",
      marginBottom: spacing.xs,
    },
    subtitle: {
      fontFamily: fonts.sans,
      fontSize: type.sm,
      color: colors.muted,
      textAlign: "center",
      marginBottom: spacing.xl,
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
      fontFamily: fonts.sans,
      fontSize: type.base,
    },
    error: { color: colors.danger, fontFamily: fonts.sans, marginTop: spacing.sm },
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
  });
}
