import { StyleSheet, Text, View } from "react-native";
import { useSettings } from "../lib/settings-context";
import { fonts, radius, type, type ThemeColors } from "../lib/theme";

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
  // UNVERIFIED is the default, permanent state for most members under the
  // honor system — showing it as a red badge on nearly everyone would read
  // as a warning about something that isn't wrong. Only render a badge when
  // it says something worth noting.
  if (status === "UNVERIFIED") return null;
  const s = styleFor(colors, status);
  return (
    <View style={[badgeStyles.badge, { backgroundColor: s.bg }]}>
      <Text style={[badgeStyles.text, { color: s.fg }]}>{status.toUpperCase()}</Text>
    </View>
  );
}

const badgeStyles = StyleSheet.create({
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.full,
  },
  text: {
    fontSize: type.xs,
    fontFamily: fonts.displaySemi,
    letterSpacing: 0.5,
  },
});
