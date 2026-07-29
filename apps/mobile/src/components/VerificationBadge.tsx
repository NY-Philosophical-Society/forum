import { StyleSheet, Text, View } from "react-native";
import { colors } from "../lib/theme";

const styleFor: Record<string, { bg: string; fg: string }> = {
  VERIFIED: { bg: colors.verifiedBg, fg: colors.verifiedText },
  PENDING: { bg: colors.pendingBg, fg: colors.pendingText },
  UNVERIFIED: { bg: colors.rejectedBg, fg: colors.danger },
  REJECTED: { bg: colors.rejectedBg, fg: colors.danger },
};

export function VerificationBadge({ status }: { status: string }) {
  const s = styleFor[status] ?? styleFor.UNVERIFIED;
  return (
    <View style={[badgeStyles.badge, { backgroundColor: s.bg }]}>
      <Text style={[badgeStyles.text, { color: s.fg }]}>{status.toLowerCase()}</Text>
    </View>
  );
}

const badgeStyles = StyleSheet.create({
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  text: {
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    fontWeight: "600",
  },
});
