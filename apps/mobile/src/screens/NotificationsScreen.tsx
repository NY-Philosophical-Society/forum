import { useNavigation, useFocusEffect, type NavigationProp } from "@react-navigation/native";
import { useCallback, useMemo, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import {
  describeNotification,
  formatRelativeTime,
  type NotificationItem,
  type NotificationsResponse,
} from "@nyps-forum/shared";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth-context";
import { pushPermissionStatus, registerForPush } from "../lib/push";
import { useSettings } from "../lib/settings-context";
import { fonts, radius, spacing, type, type ThemeColors } from "../lib/theme";
import type { RootTabParamList } from "../navigation";
import { Avatar } from "../components/Avatar";

const PAGE_SIZE = 20;

export function NotificationsScreen() {
  const { token } = useAuth();
  const { colors, dateFormat } = useSettings();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const tabNavigation = useNavigation<NavigationProp<RootTabParamList>>();
  const [items, setItems] = useState<NotificationItem[] | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // "prompt" = permission never asked → show the enable banner.
  const [pushBanner, setPushBanner] = useState<"hidden" | "prompt">("hidden");

  const load = useCallback(() => {
    if (!token) return;
    api
      .get<NotificationsResponse>(`/api/notifications?limit=${PAGE_SIZE}&offset=0`, token)
      .then((res) => {
        setItems(res.notifications);
        setHasMore(res.hasMore);
      })
      .catch((e) => setError(e.message));
  }, [token]);

  useFocusEffect(
    useCallback(() => {
      load();
      // Ask for push permission here, not on first launch: opening the
      // Alerts tab is the moment someone has shown they care about these.
      pushPermissionStatus().then((status) => {
        if (status === "undetermined") setPushBanner("prompt");
        else if (status === "granted" && token) registerForPush(token, false);
      });
    }, [load, token]),
  );

  async function enablePush() {
    if (!token) return;
    setPushBanner("hidden");
    await registerForPush(token, true);
  }

  async function loadMore() {
    if (!token || !items) return;
    setLoadingMore(true);
    try {
      const res = await api.get<NotificationsResponse>(
        `/api/notifications?limit=${PAGE_SIZE}&offset=${items.length}`,
        token,
      );
      setItems([...items, ...res.notifications]);
      setHasMore(res.hasMore);
    } finally {
      setLoadingMore(false);
    }
  }

  function open(n: NotificationItem) {
    if (token && !n.readAt) {
      api.post("/api/notifications/read", { ids: [n.id] }, token).catch(() => {});
      setItems(
        (prev) =>
          prev?.map((x) => (x.id === n.id ? { ...x, readAt: new Date().toISOString() } : x)) ??
          null,
      );
    }
    if (n.type === "message" && n.actor) {
      tabNavigation.navigate("MessagesTab", {
        screen: "Conversation",
        params: { userId: n.actor.id, displayName: n.actor.displayName },
      });
    } else if (n.threadId) {
      tabNavigation.navigate("FeedTab", {
        screen: "Thread",
        params: { threadId: n.threadId, highlightPostId: n.postId ?? undefined },
      });
    }
  }

  async function markAllRead() {
    if (!token) return;
    await api.post("/api/notifications/read-all", {}, token);
    setItems(
      (prev) => prev?.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })) ?? null,
    );
  }

  const hasUnread = items?.some((n) => !n.readAt) ?? false;

  return (
    <View style={styles.container}>
      {pushBanner === "prompt" && (
        <Pressable style={styles.pushBanner} onPress={enablePush}>
          <Text style={styles.pushBannerTitle}>Get notified on this device</Text>
          <Text style={styles.pushBannerText}>
            Tap to allow push notifications for replies, likes, mentions, and messages.
          </Text>
        </Pressable>
      )}

      {error && <Text style={styles.error}>{error}</Text>}

      {hasUnread && (
        <Pressable style={styles.markAll} onPress={markAllRead}>
          <Text style={styles.markAllText}>Mark all read</Text>
        </Pressable>
      )}

      {items?.length === 0 && (
        <View style={styles.empty}>
          <Text style={styles.emptyMark}>❦</Text>
          <Text style={styles.emptyTitle}>All quiet so far</Text>
          <Text style={styles.meta}>
            Replies, likes, mentions, and messages will gather here.
          </Text>
        </View>
      )}

      <FlatList
        data={items ?? []}
        keyExtractor={(n) => n.id}
        renderItem={({ item: n }) => (
          <Pressable
            style={[styles.row, !n.readAt && styles.rowUnread]}
            onPress={() => open(n)}
          >
            <Avatar name={n.actor?.displayName ?? "?"} uri={n.actor?.avatarUrl} size={34} />
            <View style={styles.body}>
              <Text style={styles.line}>
                <Text style={styles.actorName}>{n.actor?.displayName ?? "Someone"}</Text>{" "}
                {describeNotification(n)}
                {n.threadTitle && n.type !== "message" ? (
                  <Text style={styles.threadTitle}> “{n.threadTitle}”</Text>
                ) : null}
              </Text>
              {n.snippet ? (
                <Text style={styles.snippet} numberOfLines={2}>
                  {n.snippet}
                </Text>
              ) : null}
              <Text style={styles.meta}>{formatRelativeTime(n.createdAt, dateFormat)}</Text>
            </View>
            {!n.readAt && <View style={styles.dot} />}
          </Pressable>
        )}
        ListFooterComponent={
          hasMore ? (
            <Pressable style={styles.loadMore} onPress={loadMore} disabled={loadingMore}>
              <Text style={styles.loadMoreText}>{loadingMore ? "Loading..." : "Load more"}</Text>
            </Pressable>
          ) : null
        }
      />
    </View>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.paper, padding: spacing.lg, paddingBottom: 0 },
    error: { color: colors.danger, fontFamily: fonts.sans, marginBottom: spacing.md },
    pushBanner: {
      borderWidth: 1,
      borderColor: colors.supporterBorder,
      backgroundColor: colors.accentBg,
      borderRadius: radius.md,
      padding: spacing.lg,
      marginBottom: spacing.md,
    },
    pushBannerTitle: {
      fontFamily: fonts.serifBold,
      fontSize: type.base,
      color: colors.ink,
      marginBottom: spacing.xs,
    },
    pushBannerText: { fontFamily: fonts.sans, fontSize: type.sm, color: colors.inkSoft },
    markAll: { alignSelf: "flex-end", marginBottom: spacing.sm },
    markAllText: { color: colors.accent, fontFamily: fonts.displayMedium, fontSize: type.sm },
    row: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: spacing.md,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      padding: spacing.lg,
      marginBottom: spacing.sm,
      backgroundColor: colors.surface,
    },
    // stone2 is the emphasis fill — unread is exactly what it's for.
    rowUnread: { backgroundColor: colors.stone2 },
    body: { flex: 1, gap: spacing.xs },
    line: { fontFamily: fonts.sans, fontSize: type.base, color: colors.ink, lineHeight: 21 },
    actorName: { fontFamily: fonts.displaySemi },
    threadTitle: { fontFamily: fonts.serif },
    snippet: { fontFamily: fonts.sans, fontSize: type.sm, color: colors.muted, lineHeight: 19 },
    meta: { color: colors.muted, fontFamily: fonts.sans, fontSize: type.xs },
    dot: {
      width: 8,
      height: 8,
      borderRadius: radius.full,
      backgroundColor: colors.accent,
      marginTop: 6,
    },
    loadMore: {
      borderWidth: 1,
      borderStyle: "dashed",
      borderColor: colors.borderStrong,
      borderRadius: radius.sm,
      paddingVertical: spacing.md,
      alignItems: "center",
      marginBottom: spacing.lg,
    },
    loadMoreText: { color: colors.accent, fontFamily: fonts.displayMedium, fontSize: type.sm },
    empty: { alignItems: "center", paddingVertical: spacing.xxl, paddingHorizontal: spacing.lg },
    emptyMark: { color: colors.accent, fontSize: 28, marginBottom: spacing.md },
    emptyTitle: {
      fontFamily: fonts.serifBold,
      fontSize: type.lg,
      color: colors.ink,
      marginBottom: spacing.xs,
      textAlign: "center",
    },
  });
}
