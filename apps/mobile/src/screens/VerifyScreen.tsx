import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { VerificationSessionResponse } from "@nyps-forum/shared";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth-context";
import { useSettings } from "../lib/settings-context";
import { fonts, radius, spacing, type, type ThemeColors } from "../lib/theme";
import type { ProfileStackParamList } from "../navigation";
import { VerificationBadge } from "../components/VerificationBadge";

type Props = NativeStackScreenProps<ProfileStackParamList, "Verify">;

export function VerifyScreen({ navigation }: Props) {
  const { user, token } = useAuth();
  const { colors } = useSettings();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  if (!user) return null;

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
      <View style={styles.card}>
        <View style={styles.statusRow}>
          <Text style={styles.meta}>Current status</Text>
          <VerificationBadge status={user.verificationStatus} />
        </View>

        {user.verificationStatus === "VERIFIED" ? (
          <Text style={styles.success}>
            You&apos;re verified — you can post, reply, like, and message under your real name.
          </Text>
        ) : (
          <>
            <Text style={styles.copy}>
              This forum asks every participant to stand behind their words with their real name.
              In production this hands off to a hosted identity-verification provider: you
              photograph a government ID and take a live selfie, the provider matches the two, and
              we only ever store the pass/fail result — never the document itself. This prototype
              simulates that step locally.
            </Text>
            {error && <Text style={styles.error}>{error}</Text>}
            <Pressable style={styles.button} onPress={startVerification} disabled={starting}>
              <Text style={styles.buttonText}>
                {starting ? "Starting..." : "Start verification"}
              </Text>
            </Pressable>
          </>
        )}
      </View>
    </View>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.paper, padding: spacing.lg },
    card: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      padding: spacing.lg,
    },
    statusRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
      marginBottom: spacing.lg,
    },
    meta: { color: colors.muted, fontFamily: fonts.sans, fontSize: type.sm },
    copy: {
      fontFamily: fonts.sans,
      fontSize: type.base,
      lineHeight: 24,
      color: colors.ink,
      marginBottom: spacing.lg,
    },
    success: {
      backgroundColor: colors.verifiedBg,
      color: colors.verifiedText,
      fontFamily: fonts.sans,
      fontSize: type.sm,
      padding: spacing.md,
      borderRadius: radius.sm,
      lineHeight: 20,
    },
    error: { color: colors.danger, fontFamily: fonts.sans, marginBottom: spacing.sm },
    button: {
      backgroundColor: colors.solid,
      paddingVertical: spacing.md,
      borderRadius: radius.sm,
      alignItems: "center",
    },
    buttonText: { color: colors.solidText, fontFamily: fonts.displaySemi, fontSize: type.base },
  });
}
