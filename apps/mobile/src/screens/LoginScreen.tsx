import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useAuth } from "../lib/auth-context";
import { useSettings } from "../lib/settings-context";
import type { ThemeColors } from "../lib/theme";
import type { RootStackParamList } from "../navigation";
import { OAuthButtons } from "../components/OAuthButtons";

type Props = NativeStackScreenProps<RootStackParamList, "Login">;

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
      await login(email, password);
      // No further navigation needed — once `login` resolves, the root
      // navigator swaps from the auth stack to the app stack automatically.
    } catch (err: any) {
      setError(err.message ?? "Login failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.h1}>Log in</Text>
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
      <Pressable style={styles.linkRow} onPress={() => navigation.navigate("Signup")}>
        <Text style={styles.linkText}>Don&apos;t have an account? Sign up</Text>
      </Pressable>
      <Pressable style={styles.linkRow} onPress={() => navigation.navigate("Settings")}>
        <Text style={styles.linkText}>Settings</Text>
      </Pressable>
    </View>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.paper, padding: 16 },
    h1: { fontSize: 24, fontWeight: "700", color: colors.ink, marginBottom: 16 },
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
    linkRow: { marginTop: 16, alignItems: "center" },
    linkText: { color: colors.accent, fontWeight: "600" },
  });
}
