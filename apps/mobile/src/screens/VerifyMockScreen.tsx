import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth-context";
import { colors } from "../lib/theme";
import type { RootStackParamList } from "../navigation";

type Props = NativeStackScreenProps<RootStackParamList, "VerifyMock">;

/**
 * Stands in for a real provider's hosted verification page (Stripe Identity,
 * Persona, Veriff). A real integration opens that provider's own hosted flow
 * (often via an in-app browser / SDK) instead of this screen.
 */
export function VerifyMockScreen({ route, navigation }: Props) {
  const { sessionId } = route.params;
  const { refreshUser } = useAuth();
  const [submitting, setSubmitting] = useState(false);

  async function resolve(approve: boolean) {
    setSubmitting(true);
    try {
      await api.post(`/api/verification/mock-complete/${sessionId}`, { approve });
      await refreshUser();
      navigation.replace("Verify");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.h1}>Mock Identity Verification</Text>
      <Text style={styles.notice}>
        This screen exists only because this is a local prototype without a live Stripe Identity
        / Persona / Veriff account. A real deployment sends the user to that provider&apos;s own
        hosted flow instead.
      </Text>
      <Text style={styles.meta}>Session: {sessionId}</Text>
      <Text style={{ marginBottom: 12 }}>Simulate the outcome a real ID + selfie check would produce:</Text>
      <View style={{ flexDirection: "row", gap: 12 }}>
        <Pressable style={styles.button} onPress={() => resolve(true)} disabled={submitting}>
          <Text style={styles.buttonText}>Approved</Text>
        </Pressable>
        <Pressable style={styles.buttonSecondary} onPress={() => resolve(false)} disabled={submitting}>
          <Text style={styles.buttonSecondaryText}>Rejected</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper, padding: 16 },
  h1: { fontSize: 20, fontWeight: "700", color: colors.ink, marginBottom: 8 },
  meta: { color: colors.muted, fontSize: 13, marginBottom: 8 },
  notice: {
    backgroundColor: colors.pendingBg,
    color: colors.pendingText,
    padding: 10,
    borderRadius: 6,
    marginBottom: 12,
    fontSize: 13,
  },
  button: { backgroundColor: colors.ink, paddingVertical: 10, paddingHorizontal: 16, borderRadius: 6 },
  buttonText: { color: "white", fontWeight: "700" },
  buttonSecondary: {
    borderWidth: 1,
    borderColor: colors.ink,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 6,
  },
  buttonSecondaryText: { color: colors.ink, fontWeight: "700" },
});
