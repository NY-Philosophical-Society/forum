import { Ionicons } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useAuth } from "../lib/auth-context";
import { useSettings } from "../lib/settings-context";
import { fonts, radius, spacing, type, type ThemeColors } from "../lib/theme";
import type { ProfileStackParamList } from "../navigation";
import { VerificationBadge } from "../components/VerificationBadge";

type Props = NativeStackScreenProps<ProfileStackParamList, "Profile">;

export function ProfileScreen({ navigation }: Props) {
  const { user, logout } = useAuth();
  const { colors } = useSettings();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  if (!user) return null;

  const rows: {
    icon: keyof typeof Ionicons.glyphMap;
    label: string;
    onPress: () => void;
  }[] = [
    { icon: "shield-checkmark-outline", label: "Verification", onPress: () => navigation.navigate("Verify") },
    {
      icon: "text-outline",
      label: "Formatting guide",
      onPress: () => navigation.navigate("Formatting"),
    },
    { icon: "settings-outline", label: "Settings", onPress: () => navigation.navigate("Settings") },
  ];
  if (user.role === "admin") {
    rows.push({
      icon: "flag-outline",
      label: "Reports (admin)",
      onPress: () => navigation.navigate("AdminReports"),
    });
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{user.displayName.charAt(0).toUpperCase()}</Text>
        </View>
        <Text style={styles.name}>{user.displayName}</Text>
        <View style={styles.badges}>
          <VerificationBadge status={user.verificationStatus} />
          {user.isSupporter && (
            <View style={styles.supporterBadge}>
              <Text style={styles.supporterText}>SUPPORTER</Text>
            </View>
          )}
        </View>
      </View>

      <View style={styles.list}>
        {rows.map((row) => (
          <Pressable key={row.label} style={styles.row} onPress={row.onPress}>
            <Ionicons name={row.icon} size={20} color={colors.inkSoft} />
            <Text style={styles.rowLabel}>{row.label}</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.muted} style={{ marginLeft: "auto" }} />
          </Pressable>
        ))}
        <Pressable style={[styles.row, styles.rowDanger]} onPress={logout}>
          <Ionicons name="log-out-outline" size={20} color={colors.danger} />
          <Text style={[styles.rowLabel, { color: colors.danger }]}>Log out</Text>
        </Pressable>
      </View>
    </View>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.paper, padding: spacing.lg },
    header: { alignItems: "center", paddingVertical: spacing.xl },
    avatar: {
      width: 72,
      height: 72,
      borderRadius: radius.full,
      backgroundColor: colors.solid,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: spacing.md,
    },
    avatarText: { color: colors.solidText, fontFamily: fonts.serifBold, fontSize: type.xl },
    name: { fontFamily: fonts.serifBold, fontSize: type.lg, color: colors.ink },
    badges: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md },
    supporterBadge: {
      backgroundColor: colors.supporterBg,
      borderWidth: 1,
      borderColor: colors.supporterBorder,
      borderRadius: radius.full,
      paddingHorizontal: spacing.sm,
      paddingVertical: 3,
    },
    supporterText: {
      color: colors.supporterText,
      fontFamily: fonts.displaySemi,
      fontSize: type.xs,
      letterSpacing: 0.5,
    },
    list: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      overflow: "hidden",
      marginTop: spacing.lg,
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.lg,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    rowDanger: { borderBottomWidth: 0 },
    rowLabel: { fontFamily: fonts.displayMedium, fontSize: type.md, color: colors.ink },
  });
}
