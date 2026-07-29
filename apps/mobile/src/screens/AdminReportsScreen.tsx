import { useCallback, useMemo, useState } from "react";
import { useFocusEffect, useNavigation, type NavigationProp } from "@react-navigation/native";
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import {
  formatDateTime,
  REPORT_CATEGORY_LABELS,
  type ReportAction,
  type ReportsResponse,
  type ReportStatus,
  type ReportSummary,
} from "@nyps-forum/shared";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth-context";
import { useSettings } from "../lib/settings-context";
import { fonts, radius, spacing, type, type ThemeColors } from "../lib/theme";
import type { RootTabParamList } from "../navigation";
import { Avatar } from "../components/Avatar";

/**
 * Mobile report triage. A deliberate subset of the web dashboard: the queue is
 * the part a moderator needs on a phone. Member administration, content
 * management, and the moderation log are web-only — see docs/runs.
 */
export function AdminReportsScreen() {
  const { user, token } = useAuth();
  const { colors, dateFormat } = useSettings();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [status, setStatus] = useState<ReportStatus>("open");
  const [reports, setReports] = useState<ReportSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!token) return;
    api
      .get<ReportsResponse>(`/api/reports?status=${status}&limit=50`, token)
      .then((res) => setReports(res.reports))
      .catch((e) => setError(e.message));
  }, [token, status]);

  useFocusEffect(useCallback(() => load(), [load]));

  if (user?.role !== "admin") {
    return (
      <View style={styles.container}>
        <Text style={styles.error}>Admin access required.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.segmented}>
        {(["open", "resolved", "dismissed"] as ReportStatus[]).map((s) => (
          <Pressable
            key={s}
            style={[styles.segment, status === s && styles.segmentActive]}
            onPress={() => {
              setStatus(s);
              setReports(null);
            }}
          >
            <Text style={[styles.segmentText, status === s && styles.segmentTextActive]}>
              {s[0].toUpperCase() + s.slice(1)}
            </Text>
          </Pressable>
        ))}
      </View>

      {error && <Text style={styles.error}>{error}</Text>}

      {reports?.length === 0 && (
        <View style={styles.empty}>
          <Text style={styles.emptyMark}>❦</Text>
          <Text style={styles.emptyTitle}>
            {status === "open" ? "No open reports" : `Nothing ${status}`}
          </Text>
          <Text style={styles.meta}>
            {status === "open"
              ? "The community is conducting itself well."
              : "Switch tabs above to see other reports."}
          </Text>
        </View>
      )}

      <FlatList
        data={reports ?? []}
        keyExtractor={(r) => r.id}
        renderItem={({ item }) => (
          <ReportCard
            report={item}
            styles={styles}
            colors={colors}
            dateFormat={dateFormat}
            token={token}
            onChanged={load}
          />
        )}
      />
    </View>
  );
}

type Styles = ReturnType<typeof makeStyles>;

function ReportCard({
  report,
  styles,
  colors,
  dateFormat,
  token,
  onChanged,
}: {
  report: ReportSummary;
  styles: Styles;
  colors: ThemeColors;
  dateFormat: Parameters<typeof formatDateTime>[1];
  token: string | null;
  onChanged: () => void;
}) {
  const navigation = useNavigation<NavigationProp<RootTabParamList>>();
  const { target } = report;
  // Which action the admin has staged; the reason field and Confirm button
  // only appear once one is chosen, so nothing destructive is one tap away.
  const [pending, setPending] = useState<ReportAction | "dismiss" | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canDelete =
    (report.targetType === "thread" || report.targetType === "post") &&
    !target.deleted &&
    !target.missing;
  const canLock =
    (report.targetType === "thread" || report.targetType === "post") &&
    !target.locked &&
    !target.missing;

  const options: { key: ReportAction | "dismiss"; label: string; danger?: boolean }[] = [
    { key: "dismiss", label: "Dismiss" },
    ...(canDelete ? [{ key: "delete_content" as const, label: "Delete content", danger: true }] : []),
    ...(canLock ? [{ key: "lock_thread" as const, label: "Lock thread" }] : []),
    { key: "warn_author", label: "Warn author" },
    { key: "ban_author", label: "Ban author", danger: true },
    { key: "no_action", label: "Resolve, no action" },
  ];

  const reasonRequired = pending !== "dismiss";
  const danger = pending === "delete_content" || pending === "ban_author";

  async function commit() {
    if (!pending) return;
    setBusy(true);
    setError(null);
    try {
      if (pending === "dismiss") {
        await api.post(`/api/reports/${report.id}/dismiss`, { reason: reason.trim() }, token);
      } else {
        await api.post(
          `/api/reports/${report.id}/resolve`,
          { action: pending, reason: reason.trim() },
          token,
        );
      }
      setPending(null);
      setReason("");
      onChanged();
    } catch (e: any) {
      setError(e.message ?? "That didn't work");
    } finally {
      setBusy(false);
    }
  }

  function openTarget() {
    if (report.targetType === "user") {
      navigation.navigate("ProfileTab", {
        screen: "UserProfile",
        params: { userId: report.targetId },
      });
    } else if (target.threadId) {
      navigation.navigate("FeedTab", {
        screen: "Thread",
        params: { threadId: target.threadId, highlightPostId: target.postId ?? undefined },
      });
    }
  }

  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <View style={styles.pill}>
          <Text style={styles.pillText}>
            {REPORT_CATEGORY_LABELS[report.category].toUpperCase()}
          </Text>
        </View>
        <View style={styles.pill}>
          <Text style={styles.pillText}>{report.targetType.toUpperCase()}</Text>
        </View>
        {target.deleted && (
          <View style={styles.pillDanger}>
            <Text style={styles.pillDangerText}>DELETED</Text>
          </View>
        )}
      </View>

      <Text style={styles.meta}>
        Filed by {report.reporter?.displayName ?? "[deleted]"} ·{" "}
        {formatDateTime(report.createdAt, dateFormat)}
      </Text>

      {report.note ? <Text style={styles.note}>“{report.note}”</Text> : null}

      {/* The reported content, inline — judging it shouldn't mean leaving. */}
      <Pressable style={styles.target} onPress={openTarget}>
        {target.missing ? (
          <Text style={styles.meta}>That content no longer exists.</Text>
        ) : (
          <>
            {target.author ? (
              <View style={styles.row}>
                <Avatar
                  name={target.author.displayName}
                  uri={target.author.avatarUrl}
                  size={20}
                />
                <Text style={styles.meta}>{target.author.displayName}</Text>
              </View>
            ) : null}
            {target.title ? <Text style={styles.targetTitle}>{target.title}</Text> : null}
            {target.body ? (
              <Text style={styles.targetBody} numberOfLines={8}>
                {target.body}
              </Text>
            ) : (
              <Text style={styles.meta}>[no text]</Text>
            )}
          </>
        )}
      </Pressable>

      {report.status !== "open" ? (
        <Text style={styles.meta}>
          {report.status === "dismissed" ? "Dismissed" : "Resolved"} by{" "}
          {report.resolvedBy?.displayName ?? "[deleted]"}
          {report.resolutionNote ? ` — “${report.resolutionNote}”` : ""}
        </Text>
      ) : (
        <View style={styles.actions}>
          {options.map((o) => (
            <Pressable
              key={o.key}
              style={[
                styles.action,
                pending === o.key && (o.danger ? styles.actionActiveDanger : styles.actionActive),
              ]}
              onPress={() => {
                setPending(pending === o.key ? null : o.key);
                setError(null);
              }}
            >
              <Text style={[styles.actionText, o.danger && styles.actionTextDanger]}>
                {o.label}
              </Text>
            </Pressable>
          ))}
        </View>
      )}

      {pending && (
        <View style={[styles.confirm, danger && styles.confirmDanger]}>
          <Text style={[styles.confirmTitle, danger && styles.confirmTitleDanger]}>
            {options.find((o) => o.key === pending)?.label}
          </Text>
          <Text style={styles.meta}>{describeAction(pending, target.author?.displayName)}</Text>
          <TextInput
            style={styles.input}
            placeholder={
              pending === "warn_author"
                ? "The member reads this, and it's logged"
                : reasonRequired
                  ? "Reason (recorded in the moderation log)"
                  : "Note (optional)"
            }
            placeholderTextColor={colors.muted}
            value={reason}
            onChangeText={setReason}
            multiline
          />
          {error && <Text style={styles.error}>{error}</Text>}
          <View style={styles.row}>
            <Pressable
              style={[
                danger ? styles.submitDanger : styles.submit,
                (busy || (reasonRequired && reason.trim().length < 3)) && styles.submitDisabled,
              ]}
              onPress={commit}
              disabled={busy || (reasonRequired && reason.trim().length < 3)}
            >
              <Text style={danger ? styles.submitDangerText : styles.submitText}>
                {busy ? "Working..." : "Confirm"}
              </Text>
            </Pressable>
            <Pressable onPress={() => setPending(null)} disabled={busy}>
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}

function describeAction(action: ReportAction | "dismiss", authorName = "the author"): string {
  switch (action) {
    case "dismiss":
      return "Closes the report with no action against the member or the content.";
    case "delete_content":
      return "Soft delete: the text goes, replies underneath stay readable under a [deleted] notice.";
    case "warn_author":
      return `Sends ${authorName} a notification they can't switch off. Nothing is removed.`;
    case "ban_author":
      return `Suspends ${authorName} immediately, including their current session. Reversible from the web dashboard.`;
    case "lock_thread":
      return "Freezes the thread — no new replies, no edits. Nothing is removed.";
    case "no_action":
      return "Closes the report as handled without touching the member or the content.";
  }
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.paper, padding: spacing.lg },
    error: { color: colors.danger, fontFamily: fonts.sans, fontSize: type.sm },
    segmented: {
      flexDirection: "row",
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.sm,
      overflow: "hidden",
      marginBottom: spacing.md,
    },
    segment: { flex: 1, paddingVertical: spacing.sm, alignItems: "center" },
    segmentActive: { backgroundColor: colors.solid },
    segmentText: { fontFamily: fonts.displayMedium, fontSize: type.sm, color: colors.ink },
    segmentTextActive: { color: colors.solidText },
    card: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      padding: spacing.lg,
      marginBottom: spacing.md,
      gap: spacing.sm,
    },
    row: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: spacing.sm },
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
    pillDanger: {
      backgroundColor: colors.rejectedBg,
      borderWidth: 1,
      borderColor: colors.rejectedBorder,
      borderRadius: radius.full,
      paddingHorizontal: spacing.sm,
      paddingVertical: 2,
    },
    pillDangerText: { fontFamily: fonts.displaySemi, fontSize: type.xs, color: colors.danger },
    meta: { fontFamily: fonts.sans, fontSize: type.sm, color: colors.muted },
    note: { fontFamily: fonts.sans, fontSize: type.sm, color: colors.ink, fontStyle: "italic" },
    target: {
      borderLeftWidth: 2,
      borderLeftColor: colors.border,
      paddingLeft: spacing.md,
      gap: spacing.xs,
    },
    targetTitle: { fontFamily: fonts.serifBold, fontSize: type.base, color: colors.ink },
    targetBody: { fontFamily: fonts.sans, fontSize: type.sm, lineHeight: 20, color: colors.ink },
    actions: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
    action: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.sm,
      paddingVertical: spacing.xs,
      paddingHorizontal: spacing.md,
    },
    actionActive: { borderColor: colors.ink, backgroundColor: colors.stone2 },
    actionActiveDanger: { borderColor: colors.danger },
    actionText: { fontFamily: fonts.displayMedium, fontSize: type.sm, color: colors.ink },
    actionTextDanger: { color: colors.danger },
    confirm: {
      borderWidth: 1,
      borderColor: colors.borderStrong,
      borderRadius: radius.sm,
      padding: spacing.md,
      gap: spacing.sm,
    },
    confirmDanger: { borderColor: colors.rejectedBorder },
    confirmTitle: { fontFamily: fonts.serifBold, fontSize: type.base, color: colors.ink },
    confirmTitleDanger: { color: colors.danger },
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
    submit: {
      backgroundColor: colors.solid,
      borderRadius: radius.sm,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.lg,
    },
    submitText: { color: colors.solidText, fontFamily: fonts.displaySemi, fontSize: type.sm },
    submitDanger: {
      borderWidth: 1,
      borderColor: colors.danger,
      borderRadius: radius.sm,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.lg,
    },
    submitDangerText: { color: colors.danger, fontFamily: fonts.displaySemi, fontSize: type.sm },
    submitDisabled: { opacity: 0.5 },
    cancelText: {
      color: colors.muted,
      fontFamily: fonts.sans,
      fontSize: type.sm,
      textDecorationLine: "underline",
    },
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
