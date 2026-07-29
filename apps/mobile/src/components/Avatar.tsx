import { useMemo, useState } from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import { useSettings } from "../lib/settings-context";
import { fonts, radius, type ThemeColors } from "../lib/theme";

/** First letter of the name; "?" for names with none (e.g. "[deleted]"). */
export function avatarInitial(name: string): string {
  const letter = name.match(/\p{L}/u);
  return letter ? letter[0].toUpperCase() : "?";
}

/**
 * Photo when the member has one, initials otherwise — the one avatar
 * treatment for bylines, conversation rows, and profile headers.
 */
export function Avatar({
  name,
  uri,
  size = 22,
}: {
  name: string;
  /** Photo URL; null/undefined falls back to initials. */
  uri?: string | null;
  size?: number;
}) {
  const { colors } = useSettings();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  // Tracks the exact URL that failed, so a *new* uri gets a fresh chance
  // and a dead one degrades to initials instead of an empty box.
  const [brokenUri, setBrokenUri] = useState<string | null>(null);
  const frame = { width: size, height: size, borderRadius: radius.full };

  if (uri && brokenUri !== uri) {
    return (
      <Image source={{ uri }} style={[styles.photo, frame]} onError={() => setBrokenUri(uri)} />
    );
  }
  return (
    <View style={[styles.circle, frame]}>
      <Text style={[styles.initial, { fontSize: Math.max(10, Math.round(size * 0.42)) }]}>
        {avatarInitial(name)}
      </Text>
    </View>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    photo: { backgroundColor: colors.stone2 },
    circle: { backgroundColor: colors.solid, alignItems: "center", justifyContent: "center" },
    initial: { color: colors.solidText, fontFamily: fonts.displaySemi },
  });
}
