import { StyleSheet, Text, View } from "react-native";
import { useSettings } from "../lib/settings-context";
import type { ThemeColors } from "../lib/theme";

function styleFor(colors: ThemeColors, status: string): { bg: string; fg: string } {
  const map: Record<string, { bg: string; fg: string }> = {
    VERIFIED: { bg: colors.verifiedBg, fg: colors.verifiedText },
    PENDING: { bg: colors.pendingBg, fg: colors.pendingText },
    UNVERIFIED: { bg: colors.rejectedBg, fg: colors.danger },
    REJECTED: { bg: colors.rejectedBg, fg: colors.danger },
  };
  return map[status] ?? map.UNVERIFIED;
}

export function VerificationBadge({ status }: { status: string }) {
  const { colors } = useSettings();
  const s = styleFor(colors, status);
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
