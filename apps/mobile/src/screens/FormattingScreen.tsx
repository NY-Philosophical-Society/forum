import { useMemo } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { Markdown } from "../components/Markdown";
import { useSettings } from "../lib/settings-context";
import { fonts, radius, spacing, type, type ThemeColors } from "../lib/theme";

/** Source on top, rendered result below — same pairs as the web guide. */
const EXAMPLES: { title: string; source: string }[] = [
  {
    title: "Emphasis",
    source: "Aristotle calls it **eudaimonia**, usually rendered *flourishing*.",
  },
  {
    title: "Quoting a text",
    source:
      "> Custom is the great guide of human life.\n>\n> — David Hume, *An Enquiry Concerning Human Understanding* V.i",
  },
  {
    title: "Quoting another member",
    source:
      "> > The only freedom which deserves the name is that of pursuing our own good in our own way.\n>\n> This is right about how we *do* reason, and silent on how we *ought* to.",
  },
  {
    title: "Links",
    source: "See the [SEP entry on necessity](https://plato.stanford.edu/).",
  },
  {
    title: "Bulleted list",
    source: "- Free will\n- Moral luck\n- Personal identity",
  },
  {
    title: "Numbered list",
    source: "1. State the claim\n2. Give the argument\n3. Answer the strongest objection",
  },
  {
    title: "Notation",
    source: "Modus ponens takes `P → Q` and `P` to `Q`.",
  },
];

export function FormattingScreen() {
  const { colors } = useSettings();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: spacing.lg }}>
      <Text style={styles.intro}>
        Posts and replies are written in Markdown. Type the plain text on the left of each pair and
        it will appear as shown below it.
      </Text>

      {EXAMPLES.map((ex) => (
        <View key={ex.title} style={styles.example}>
          <Text style={styles.exampleTitle}>{ex.title}</Text>
          <View style={styles.source}>
            <Text style={styles.sourceText}>{ex.source}</Text>
          </View>
          <View style={styles.result}>
            <Markdown>{ex.source}</Markdown>
          </View>
        </View>
      ))}

      <View style={styles.example}>
        <Text style={styles.exampleTitle}>Mentions</Text>
        <Text style={styles.notice}>
          Type @ followed by a member's name in the composer and pick them from the list — the
          mention becomes a link to their profile.
        </Text>
      </View>

      <View style={styles.example}>
        <Text style={styles.exampleTitle}>Images</Text>
        <Text style={styles.notice}>
          Use the 🖼 toolbar button to add a photo from your camera or library (up to 8MB). Only
          images uploaded here render inline; a link to an image elsewhere stays a link.
        </Text>
      </View>

      <Text style={styles.notice}>
        Raw HTML is deliberately not rendered — it appears as plain text.
      </Text>
    </ScrollView>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.paper },
    intro: {
      fontFamily: fonts.sans,
      fontSize: type.base,
      lineHeight: 24,
      color: colors.inkSoft,
      marginBottom: spacing.lg,
    },
    example: { marginBottom: spacing.xl },
    exampleTitle: {
      fontFamily: fonts.displaySemi,
      fontSize: type.sm,
      color: colors.muted,
      textTransform: "uppercase",
      letterSpacing: 0.6,
      marginBottom: spacing.sm,
    },
    source: {
      backgroundColor: colors.stone2,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.sm,
      padding: spacing.md,
    },
    sourceText: {
      fontFamily: fonts.sans,
      fontSize: type.sm,
      lineHeight: 21,
      color: colors.inkSoft,
    },
    result: {
      borderLeftWidth: 1,
      borderLeftColor: colors.border,
      paddingLeft: spacing.md,
      marginTop: spacing.md,
    },
    notice: {
      fontFamily: fonts.sans,
      fontSize: type.sm,
      color: colors.muted,
      marginBottom: spacing.xl,
    },
  });
}
