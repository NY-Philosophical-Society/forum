import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import {
  REPORT_CATEGORIES,
  REPORT_CATEGORY_LABELS,
  type ReportCategory,
  type ReportTargetType,
} from "@nyps-forum/shared";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth-context";
import { useSettings } from "../lib/settings-context";
import { fonts, radius, spacing, type, type ThemeColors } from "../lib/theme";

export function ReportButton({
  targetType,
  targetId,
}: {
  targetType: ReportTargetType;
  targetId: string;
}) {
  const { token, user } = useAuth();
  const { colors } = useSettings();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [open, setOpen] = useState(false);
  // No pre-selection: the category is the substance of the report. A picker
  // list rather than a web-style <select>, per the platform-UX rule.
  const [category, setCategory] = useState<ReportCategory | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!user) return null;
  if (done) return <Text style={styles.doneText}>Reported</Text>;

  if (!open) {
    return (
      <Pressable onPress={() => setOpen(true)}>
        <Text style={styles.linkText}>Report</Text>
      </Pressable>
    );
  }

  async function submit() {
    if (!token || !category) return;
    setBusy(true);
    setError(null);
    try {
      await api.post("/api/reports", { targetType, targetId, category, note: note.trim() }, token);
      setDone(true);
      setOpen(false);
    } catch (err: any) {
      setError(err.message ?? "Could not submit report");
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.form}>
      <Text style={styles.label}>Why are you reporting this?</Text>
      {REPORT_CATEGORIES.map((c) => {
        const selected = category === c;
        return (
          <Pressable
            key={c}
            style={[styles.option, selected && styles.optionSelected]}
            onPress={() => setCategory(c)}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
          >
            <Text style={[styles.optionText, selected && styles.optionTextSelected]}>
              {selected ? "✓ " : ""}
              {REPORT_CATEGORY_LABELS[c]}
            </Text>
          </Pressable>
        );
      })}
      <TextInput
        style={styles.input}
        placeholder="Anything to add? (optional)"
        placeholderTextColor={colors.muted}
        value={note}
        onChangeText={setNote}
        multiline
      />
      {error && <Text style={styles.error}>{error}</Text>}
      <View style={styles.row}>
        <Pressable
          style={[styles.submit, (busy || !category) && styles.submitDisabled]}
          onPress={submit}
          disabled={busy || !category}
        >
          <Text style={styles.submitText}>{busy ? "Submitting..." : "Submit"}</Text>
        </Pressable>
        <Pressable onPress={() => setOpen(false)}>
          <Text style={styles.linkText}>Cancel</Text>
        </Pressable>
      </View>
    </View>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    linkText: {
      color: colors.muted,
      fontFamily: fonts.sans,
      fontSize: type.sm,
      textDecorationLine: "underline",
    },
    doneText: { color: colors.muted, fontFamily: fonts.sans, fontSize: type.sm },
    form: { marginTop: spacing.sm, width: "100%", gap: spacing.sm },
    label: { color: colors.ink, fontFamily: fonts.sans, fontSize: type.sm },
    option: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.sm,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
    },
    optionSelected: { borderColor: colors.accent, backgroundColor: colors.accentBg },
    optionText: { color: colors.ink, fontFamily: fonts.sans, fontSize: type.sm },
    optionTextSelected: { color: colors.accent, fontFamily: fonts.displaySemi },
    input: {
      borderWidth: 1,
      borderColor: colors.borderStrong,
      borderRadius: radius.sm,
      padding: spacing.md,
      minHeight: 60,
      backgroundColor: colors.surface,
      color: colors.ink,
      fontFamily: fonts.sans,
      fontSize: type.sm,
      textAlignVertical: "top",
    },
    error: { color: colors.danger, fontFamily: fonts.sans, fontSize: type.sm },
    row: { flexDirection: "row", alignItems: "center", gap: spacing.md },
    submit: {
      backgroundColor: colors.solid,
      borderRadius: radius.sm,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.lg,
    },
    submitDisabled: { opacity: 0.5 },
    submitText: { color: colors.solidText, fontFamily: fonts.displaySemi, fontSize: type.sm },
  });
}
