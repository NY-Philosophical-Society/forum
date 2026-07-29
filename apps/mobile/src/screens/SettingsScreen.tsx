import { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSettings } from "../lib/settings-context";
import type { ThemeColors } from "../lib/theme";

export function SettingsScreen() {
  const { dateFormat, setDateFormat, themeName, setThemeName, colors } = useSettings();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <View style={styles.container}>
      <Text style={styles.h2}>Date format</Text>
      <Text style={styles.meta}>Applies to every date and time shown across the app.</Text>
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

      <Text style={[styles.h2, { marginTop: 24 }]}>Appearance</Text>
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
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.paper, padding: 16 },
    h2: { fontSize: 18, fontWeight: "700", color: colors.ink, marginBottom: 4 },
    meta: { color: colors.muted, fontSize: 13, marginBottom: 12 },
    segmented: {
      flexDirection: "row",
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 999,
      overflow: "hidden",
      alignSelf: "flex-start",
    },
    segment: { paddingVertical: 8, paddingHorizontal: 16, backgroundColor: colors.surface },
    segmentActive: { backgroundColor: colors.solid },
    segmentText: { color: colors.ink, fontWeight: "600" },
    segmentTextActive: { color: colors.solidText, fontWeight: "600" },
  });
}
