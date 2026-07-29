import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import type { ReportTargetType } from "@nyps-forum/shared";
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
  const [reason, setReason] = useState("");
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
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      await api.post("/api/reports", { targetType, targetId, reason }, token);
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
      <TextInput
        style={styles.input}
        placeholder="Why are you reporting this?"
        placeholderTextColor={colors.muted}
        value={reason}
        onChangeText={setReason}
        multiline
      />
      {error && <Text style={styles.error}>{error}</Text>}
      <View style={styles.row}>
        <Pressable style={styles.submit} onPress={submit} disabled={busy || !reason.trim()}>
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
    submitText: { color: colors.solidText, fontFamily: fonts.displaySemi, fontSize: type.sm },
  });
}
