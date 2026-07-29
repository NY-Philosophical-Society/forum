import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth-context";
import { useSettings } from "../lib/settings-context";
import { fonts, radius, spacing, type, type ThemeColors } from "../lib/theme";
import type { ProfileStackParamList } from "../navigation";

type Props = NativeStackScreenProps<ProfileStackParamList, "VerifyMock">;

/**
 * Stands in for a real provider's hosted verification page (Stripe Identity,
 * Persona, Veriff). A real integration opens that provider's own hosted flow
 * instead of this screen.
 */
export function VerifyMockScreen({ route, navigation }: Props) {
  const { sessionId } = route.params;
  const { refreshUser } = useAuth();
  const { colors } = useSettings();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [submitting, setSubmitting] = useState(false);

  async function resolve(approve: boolean) {
    setSubmitting(true);
    try {
      await api.post(`/api/verification/mock-complete/${sessionId}`, { approve });
      await refreshUser();
      navigation.navigate("Verify");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.notice}>
        This screen exists only because this is a local prototype without a live verification
        vendor. A real deployment sends you to the provider&apos;s own hosted flow.
      </Text>
      <Text style={styles.meta}>Session: {sessionId}</Text>
      <Text style={styles.copy}>Simulate the outcome a real ID + selfie check would produce:</Text>
      <View style={styles.row}>
        <Pressable style={styles.button} onPress={() => resolve(true)} disabled={submitting}>
          <Text style={styles.buttonText}>Approved</Text>
        </Pressable>
        <Pressable
          style={styles.buttonSecondary}
          onPress={() => resolve(false)}
          disabled={submitting}
        >
          <Text style={styles.buttonSecondaryText}>Rejected</Text>
        </Pressable>
      </View>
    </View>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.paper, padding: spacing.lg },
    notice: {
      backgroundColor: colors.pendingBg,
      color: colors.pendingText,
      fontFamily: fonts.sans,
      fontSize: type.sm,
      padding: spacing.md,
      borderRadius: radius.sm,
      marginBottom: spacing.lg,
      lineHeight: 20,
    },
    meta: {
      color: colors.muted,
      fontFamily: fonts.sans,
      fontSize: type.sm,
      marginBottom: spacing.md,
    },
    copy: {
      fontFamily: fonts.sans,
      fontSize: type.base,
      color: colors.ink,
      marginBottom: spacing.lg,
    },
    row: { flexDirection: "row", gap: spacing.md },
    button: {
      backgroundColor: colors.solid,
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.xl,
      borderRadius: radius.sm,
    },
    buttonText: { color: colors.solidText, fontFamily: fonts.displaySemi, fontSize: type.sm },
    buttonSecondary: {
      borderWidth: 1,
      borderColor: colors.borderStrong,
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.xl,
      borderRadius: radius.sm,
    },
    buttonSecondaryText: { color: colors.ink, fontFamily: fonts.displaySemi, fontSize: type.sm },
  });
}
