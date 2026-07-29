import { useMemo } from "react";
import { Linking } from "react-native";
import MarkdownDisplay from "react-native-markdown-display";
import { useSettings } from "../lib/settings-context";
import { fonts, radius, spacing, type, type ThemeColors } from "../lib/theme";

/**
 * Renders post bodies. The library parses markdown to its own components —
 * it never evaluates HTML — so member text can't inject markup.
 */
export function Markdown({ children }: { children: string }) {
  const { colors } = useSettings();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <MarkdownDisplay
      style={styles}
      onLinkPress={(url) => {
        Linking.openURL(url).catch(() => {});
        return false;
      }}
    >
      {children}
    </MarkdownDisplay>
  );
}

function makeStyles(colors: ThemeColors) {
  const body = {
    fontFamily: fonts.sans,
    fontSize: type.base,
    lineHeight: 24,
    color: colors.ink,
  };

  return {
    body,
    paragraph: { marginTop: 0, marginBottom: spacing.md },
    strong: { fontWeight: "700" as const },
    em: { fontStyle: "italic" as const },
    link: { color: colors.accent, textDecorationLine: "underline" as const },
    // Quoting is the backbone of argument here — give it the accent rule.
    blockquote: {
      backgroundColor: "transparent",
      borderLeftWidth: 3,
      borderLeftColor: colors.accent,
      paddingLeft: spacing.md,
      marginLeft: 0,
      marginVertical: spacing.sm,
    },
    bullet_list: { marginBottom: spacing.md },
    ordered_list: { marginBottom: spacing.md },
    list_item: { marginBottom: spacing.xs },
    heading1: { fontFamily: fonts.serifBold, fontSize: type.lg, color: colors.ink, marginBottom: spacing.sm },
    heading2: { fontFamily: fonts.serifBold, fontSize: type.md, color: colors.ink, marginBottom: spacing.sm },
    heading3: { fontFamily: fonts.serifBold, fontSize: type.base, color: colors.ink, marginBottom: spacing.xs },
    code_inline: {
      backgroundColor: colors.stone2,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 4,
      color: colors.ink,
      fontSize: type.sm,
    },
    fence: {
      backgroundColor: colors.stone2,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.sm,
      color: colors.ink,
      marginBottom: spacing.md,
    },
    code_block: {
      backgroundColor: colors.stone2,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.sm,
      color: colors.ink,
    },
    hr: { backgroundColor: colors.border, height: 1, marginVertical: spacing.lg },
    table: { borderColor: colors.border, borderRadius: radius.sm, marginBottom: spacing.md },
    th: { backgroundColor: colors.stone2, padding: spacing.sm },
    td: { padding: spacing.sm, borderColor: colors.border },
  };
}
