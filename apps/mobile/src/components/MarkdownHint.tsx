import { useMemo } from "react";
import { StyleSheet, Text } from "react-native";
import { useSettings } from "../lib/settings-context";
import { fonts, spacing, type, type ThemeColors } from "../lib/theme";

/**
 * Composer footnote — spells out the syntax the toolbar inserts and points
 * at the full guide.
 */
export function MarkdownHint() {
  const { colors } = useSettings();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <Text style={styles.hint}>
      Markdown: **bold**, *italic*, {"> quote"}, - list. Full guide under Profile → Formatting
      guide.
    </Text>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    hint: {
      fontFamily: fonts.sans,
      fontSize: type.xs,
      lineHeight: 17,
      color: colors.muted,
      marginTop: spacing.xs,
    },
  });
}
