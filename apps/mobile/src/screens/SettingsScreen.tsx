import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import type { NotificationPreferences, PublicUser } from "@nyps-forum/shared";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth-context";
import { useSettings } from "../lib/settings-context";
import { fonts, radius, spacing, type, type ThemeColors } from "../lib/theme";

const PREF_ROWS: {
  key: keyof Omit<NotificationPreferences, "master">;
  label: string;
  hint: string;
}[] = [
  { key: "replies", label: "Replies", hint: "Someone replies to your thread or your reply" },
  { key: "likes", label: "Likes", hint: "Someone likes your thread or reply" },
  { key: "mentions", label: "Mentions", hint: "Someone @mentions you" },
  { key: "messages", label: "Messages", hint: "A new direct message arrives" },
];

export function SettingsScreen() {
  const { dateFormat, setDateFormat, themeName, setThemeName, colors } = useSettings();
  const { user, token, refreshUser } = useAuth();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [code, setCode] = useState("");
  const [redeeming, setRedeeming] = useState(false);
  const [redeemError, setRedeemError] = useState<string | null>(null);
  const [redeemed, setRedeemed] = useState(false);
  const [prefs, setPrefs] = useState<NotificationPreferences | null>(null);
  const [prefsError, setPrefsError] = useState<string | null>(null);

  // This screen also sits in the logged-out stack; no token, no section.
  useEffect(() => {
    if (!token) return;
    api
      .get<{ preferences: NotificationPreferences }>("/api/notifications/preferences", token)
      .then((res) => setPrefs(res.preferences))
      .catch(() => {});
  }, [token]);

  async function togglePref(key: keyof NotificationPreferences) {
    if (!token || !prefs) return;
    const next = { ...prefs, [key]: !prefs[key] };
    setPrefs(next); // optimistic — reverted below if the save fails
    setPrefsError(null);
    try {
      const res = await api.put<{ preferences: NotificationPreferences }>(
        "/api/notifications/preferences",
        { [key]: next[key] },
        token,
      );
      setPrefs(res.preferences);
    } catch (err: any) {
      setPrefs(prefs);
      setPrefsError(err.message ?? "Could not save that preference");
    }
  }

  async function redeemCode() {
    if (!token) return;
    setRedeemError(null);
    setRedeeming(true);
    try {
      await api.post<{ user: PublicUser }>("/api/auth/redeem-code", { code }, token);
      setRedeemed(true);
      setCode("");
      await refreshUser();
    } catch (err: any) {
      setRedeemError(err.message ?? "Could not redeem that code");
    } finally {
      setRedeeming(false);
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: spacing.lg }}>
      <View style={styles.section}>
        <Text style={styles.h2}>Date format</Text>
        <Text style={styles.meta}>Applies to every date and time shown across the forum.</Text>
        <View style={styles.segmented}>
          <Pressable
            style={[styles.segment, dateFormat === "MDY" && styles.segmentActive]}
            onPress={() => setDateFormat("MDY")}
          >
            <Text style={dateFormat === "MDY" ? styles.segmentTextActive : styles.segmentText}>
              MM/DD/YYYY
            </Text>
          </Pressable>
          <Pressable
            style={[styles.segment, dateFormat === "DMY" && styles.segmentActive]}
            onPress={() => setDateFormat("DMY")}
          >
            <Text style={dateFormat === "DMY" ? styles.segmentTextActive : styles.segmentText}>
              DD/MM/YYYY
            </Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.h2}>Appearance</Text>
        <Text style={styles.meta}>
          The dark theme is provisional while the official palette is drawn up.
        </Text>
        <View style={styles.segmented}>
          <Pressable
            style={[styles.segment, themeName === "light" && styles.segmentActive]}
            onPress={() => setThemeName("light")}
          >
            <Text style={themeName === "light" ? styles.segmentTextActive : styles.segmentText}>
              Light
            </Text>
          </Pressable>
          <Pressable
            style={[styles.segment, themeName === "dark" && styles.segmentActive]}
            onPress={() => setThemeName("dark")}
          >
            <Text style={themeName === "dark" ? styles.segmentTextActive : styles.segmentText}>
              Dark
            </Text>
          </Pressable>
        </View>
      </View>

      {user && prefs && (
        <View style={styles.section}>
          <Text style={styles.h2}>Notifications</Text>
          <Text style={styles.meta}>
            Per-type switches cover in-app alerts and push notifications alike.
          </Text>
          <View style={styles.prefRow}>
            <View style={styles.prefText}>
              <Text style={styles.prefLabel}>All notifications</Text>
              <Text style={styles.prefHint}>
                Master switch — turns everything off at once, push included.
              </Text>
            </View>
            <Switch
              value={prefs.master}
              onValueChange={() => togglePref("master")}
              trackColor={{ false: colors.border, true: colors.accent }}
            />
          </View>
          {PREF_ROWS.map((row) => (
            <View key={row.key} style={styles.prefRow}>
              <View style={styles.prefText}>
                <Text style={[styles.prefLabel, !prefs.master && styles.prefDisabled]}>
                  {row.label}
                </Text>
                <Text style={styles.prefHint}>{row.hint}</Text>
              </View>
              <Switch
                value={prefs[row.key]}
                disabled={!prefs.master}
                onValueChange={() => togglePref(row.key)}
                trackColor={{ false: colors.border, true: colors.accent }}
              />
            </View>
          ))}
          {prefsError && <Text style={styles.error}>{prefsError}</Text>}
        </View>
      )}

      {user && (
        <View style={styles.section}>
          <Text style={styles.h2}>Supporter access</Text>
          {user.isSupporter || redeemed ? (
            <Text style={styles.success}>
              You have supporter access — thank you for sustaining the Society&apos;s events and
              journal.
            </Text>
          ) : (
            <>
              <Text style={styles.meta}>
                Have an access code from a donation or journal subscription? Redeem it here.
              </Text>
              <TextInput
                style={styles.input}
                value={code}
                onChangeText={setCode}
                placeholder="Access code"
                placeholderTextColor={colors.muted}
                autoCapitalize="characters"
              />
              {redeemError && <Text style={styles.error}>{redeemError}</Text>}
              <Pressable
                style={styles.button}
                onPress={redeemCode}
                disabled={redeeming || !code.trim()}
              >
                <Text style={styles.buttonText}>{redeeming ? "Redeeming..." : "Redeem code"}</Text>
              </Pressable>
            </>
          )}
        </View>
      )}
    </ScrollView>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.paper },
    section: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      padding: spacing.lg,
      marginBottom: spacing.lg,
    },
    h2: { fontFamily: fonts.serifBold, fontSize: type.md, color: colors.ink, marginBottom: spacing.xs },
    meta: {
      color: colors.muted,
      fontFamily: fonts.sans,
      fontSize: type.sm,
      marginBottom: spacing.md,
    },
    segmented: {
      flexDirection: "row",
      backgroundColor: colors.stone2,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.full,
      padding: 3,
      alignSelf: "flex-start",
    },
    segment: { paddingVertical: 6, paddingHorizontal: spacing.lg, borderRadius: radius.full },
    segmentActive: { backgroundColor: colors.surface },
    segmentText: { color: colors.muted, fontFamily: fonts.displaySemi, fontSize: type.sm },
    segmentTextActive: { color: colors.ink, fontFamily: fonts.displaySemi, fontSize: type.sm },
    input: {
      borderWidth: 1,
      borderColor: colors.borderStrong,
      borderRadius: radius.sm,
      padding: spacing.md,
      backgroundColor: colors.surface,
      color: colors.ink,
      fontFamily: fonts.sans,
      fontSize: type.base,
    },
    error: { color: colors.danger, fontFamily: fonts.sans, marginTop: spacing.sm },
    prefRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
      paddingVertical: spacing.sm,
    },
    prefText: { flex: 1 },
    prefLabel: { fontFamily: fonts.displayMedium, fontSize: type.base, color: colors.ink },
    prefDisabled: { color: colors.muted },
    prefHint: { fontFamily: fonts.sans, fontSize: type.xs, color: colors.muted },
    success: {
      backgroundColor: colors.verifiedBg,
      color: colors.verifiedText,
      fontFamily: fonts.sans,
      fontSize: type.sm,
      padding: spacing.md,
      borderRadius: radius.sm,
    },
    button: {
      backgroundColor: colors.solid,
      paddingVertical: spacing.md,
      borderRadius: radius.sm,
      alignItems: "center",
      marginTop: spacing.md,
    },
    buttonText: { color: colors.solidText, fontFamily: fonts.displaySemi, fontSize: type.sm },
  });
}
