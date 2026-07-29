import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useAuth } from "../lib/auth-context";
import { colors } from "../lib/theme";
import type { RootStackParamList } from "../navigation";
import { OAuthButtons } from "../components/OAuthButtons";

type Props = NativeStackScreenProps<RootStackParamList, "Login">;

export function LoginScreen({ navigation }: Props) {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit() {
    setError(null);
    setSubmitting(true);
    try {
      await login(email, password);
      navigation.replace("Home");
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper, padding: 16 },
  h1: { fontSize: 24, fontWeight: "700", color: colors.ink, marginBottom: 16 },
  label: { fontWeight: "700", color: colors.ink, marginTop: 8, marginBottom: 4 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 6,
    padding: 10,
    backgroundColor: "white",
  },
  error: { color: colors.danger, marginTop: 8 },
  button: {
    backgroundColor: colors.ink,
    paddingVertical: 12,
    borderRadius: 6,
    alignItems: "center",
    marginTop: 16,
  },
  buttonText: { color: "white", fontWeight: "700" },
});
