import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { VerificationSessionResponse } from "@nyps-forum/shared";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth-context";
import { useSettings } from "../lib/settings-context";
import type { ThemeColors } from "../lib/theme";
import type { RootStackParamList } from "../navigation";

type Props = NativeStackScreenProps<RootStackParamList, "Verify">;

export function VerifyScreen({ navigation }: Props) {
  const { user, token } = useAuth();
  const { colors } = useSettings();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  if (!user) {
    return (
      <View style={styles.container}>
        <Text style={styles.body}>You need to log in first.</Text>
      </View>
    );
  }

  async function startVerification() {
    setError(null);
    setStarting(true);
    try {
      const res = await api.post<VerificationSessionResponse>(
        "/api/verification/start",
        {},
        token,
      );
      navigation.navigate("VerifyMock", { sessionId: res.sessionId });
    } catch (err: any) {
      setError(err.message ?? "Could not start verification");
    } finally {
      setStarting(false);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.h1}>Identity Verification</Text>
      <Text style={styles.body}>
        Current status: <Text style={{ fontWeight: "700" }}>{user.verificationStatus}</Text>
      </Text>

      {user.verificationStatus === "VERIFIED" ? (
        <Text style={styles.notice}>You&apos;re verified — you can post and reply.</Text>
      ) : (
        <>
          <Text style={styles.meta}>
            In production this hands off to a hosted identity-verification provider (Stripe
            Identity / Persona / Veriff): you photograph a government ID and take a live selfie,
            the provider matches the two, and we only ever store the pass/fail result — never the
            document image. This prototype simulates that step locally.
          </Text>
          {error && <Text style={styles.error}>{error}</Text>}
          <Pressable style={styles.button} onPress={startVerification} disabled={starting}>
            <Text style={styles.buttonText}>{starting ? "Starting..." : "Start verification"}</Text>
          </Pressable>
        </>
      )}
    </View>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.paper, padding: 16 },
    h1: { fontSize: 22, fontWeight: "700", color: colors.ink, marginBottom: 8 },
    body: { color: colors.ink },
    meta: { color: colors.muted, fontSize: 13, marginVertical: 12 },
    error: { color: colors.danger },
    notice: {
      backgroundColor: colors.verifiedBg,
      color: colors.verifiedText,
      padding: 10,
      borderRadius: 6,
      marginTop: 12,
    },
    button: {
      backgroundColor: colors.solid,
      paddingVertical: 12,
      borderRadius: 6,
      alignItems: "center",
      marginTop: 8,
    },
    buttonText: { color: colors.solidText, fontWeight: "700" },
  });
}
