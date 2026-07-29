import { useCallback, useMemo, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import { FlatList, StyleSheet, Text, View } from "react-native";
import {
  formatDateTime,
  REPORT_CATEGORY_LABELS,
  type ReportSummary,
} from "@nyps-forum/shared";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth-context";
import { useSettings } from "../lib/settings-context";
import { fonts, radius, spacing, type, type ThemeColors } from "../lib/theme";

export function AdminReportsScreen() {
  const { user, token } = useAuth();
  const { colors, dateFormat } = useSettings();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [reports, setReports] = useState<ReportSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!token) return;
      api
        .get<{ reports: ReportSummary[] }>("/api/reports", token)
        .then((res) => setReports(res.reports))
        .catch((e) => setError(e.message));
    }, [token]),
  );

  if (user?.role !== "admin") {
    return (
      <View style={styles.container}>
        <Text style={styles.error}>Admin access required.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {error && <Text style={styles.error}>{error}</Text>}
      {reports?.length === 0 && (
        <View style={styles.empty}>
          <Text style={styles.emptyMark}>❦</Text>
          <Text style={styles.emptyTitle}>No open reports</Text>
          <Text style={styles.meta}>The community is conducting itself well.</Text>
        </View>
      )}
      <FlatList
        data={reports ?? []}
        keyExtractor={(r) => r.id}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.row}>
              <View style={styles.pill}>
                <Text style={styles.pillText}>{item.targetType.toUpperCase()}</Text>
              </View>
              <View style={styles.pill}>
                <Text style={styles.pillText}>
                  {REPORT_CATEGORY_LABELS[item.category].toUpperCase()}
                </Text>
              </View>
            </View>
            {item.note ? <Text style={styles.body}>{item.note}</Text> : null}
            <Text style={styles.meta}>{formatDateTime(item.createdAt, dateFormat)}</Text>
          </View>
        )}
      />
    </View>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.paper, padding: spacing.lg },
    error: { color: colors.danger, fontFamily: fonts.sans },
    card: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      padding: spacing.lg,
      marginBottom: spacing.md,
    },
    row: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.sm },
    pill: {
      backgroundColor: colors.stone2,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.full,
      paddingHorizontal: spacing.sm,
      paddingVertical: 2,
    },
    pillText: {
      fontFamily: fonts.displaySemi,
      fontSize: type.xs,
      color: colors.inkSoft,
      letterSpacing: 0.5,
    },
    body: {
      fontFamily: fonts.sans,
      fontSize: type.base,
      lineHeight: 22,
      color: colors.ink,
      marginBottom: spacing.sm,
    },
    meta: { fontFamily: fonts.sans, fontSize: type.sm, color: colors.muted },
    empty: { alignItems: "center", paddingVertical: spacing.xxl },
    emptyMark: { color: colors.accent, fontSize: 28, marginBottom: spacing.md },
    emptyTitle: {
      fontFamily: fonts.serifBold,
      fontSize: type.lg,
      color: colors.ink,
      marginBottom: spacing.xs,
    },
  });
}
