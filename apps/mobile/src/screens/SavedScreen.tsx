import { useNavigation, useFocusEffect, type NavigationProp } from "@react-navigation/native";
import { useCallback, useMemo, useState } from "react";
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { formatDate, type ThreadFeedResponse, type ThreadSummary } from "@nyps-forum/shared";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth-context";
import { useSettings } from "../lib/settings-context";
import { fonts, radius, spacing, type, type ThemeColors } from "../lib/theme";
import type { RootTabParamList } from "../navigation";
import { Avatar } from "../components/Avatar";

const PAGE_SIZE = 20;

export function SavedScreen() {
  const { token } = useAuth();
  const { colors, dateFormat } = useSettings();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const tabNavigation = useNavigation<NavigationProp<RootTabParamList>>();
  const [threads, setThreads] = useState<ThreadSummary[] | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(() => {
    if (!token) return Promise.resolve();
    return api
      .get<ThreadFeedResponse>(`/api/bookmarks?limit=${PAGE_SIZE}&offset=0`, token)
      .then((res) => {
        setThreads(res.threads);
        setHasMore(res.hasMore);
      })
      .catch((e) => setError(e.message));
  }, [token]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  async function loadMore() {
    if (!token || !threads) return;
    setLoadingMore(true);
    try {
      const res = await api.get<ThreadFeedResponse>(
        `/api/bookmarks?limit=${PAGE_SIZE}&offset=${threads.length}`,
        token,
      );
      setThreads([...threads, ...res.threads]);
      setHasMore(res.hasMore);
    } finally {
      setLoadingMore(false);
    }
  }

  async function unsave(threadId: string) {
    if (!token) return;
    await api.delete(`/api/bookmarks/${threadId}`, token);
    setThreads((prev) => prev?.filter((t) => t.id !== threadId) ?? null);
  }

  return (
    <View style={styles.container}>
      {error && <Text style={styles.error}>{error}</Text>}

      {threads?.length === 0 && (
        <View style={styles.empty}>
          <Text style={styles.emptyMark}>❦</Text>
          <Text style={styles.emptyTitle}>Nothing saved yet</Text>
          <Text style={styles.meta}>Use “Save” on any thread to keep it here for later.</Text>
        </View>
      )}

      <FlatList
        data={threads ?? []}
        keyExtractor={(t) => t.id}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />
        }
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Pressable
              onPress={() =>
                tabNavigation.navigate("FeedTab", {
                  screen: "Thread",
                  params: { threadId: item.id },
                })
              }
            >
              <Text style={styles.cardTitle}>
                {item.title}
                {item.locked ? " 🔒" : ""}
              </Text>
            </Pressable>
            <View style={styles.byline}>
              <Avatar name={item.author.displayName} uri={item.author.avatarUrl} size={22} />
              <Text style={styles.meta}>
                {item.author.displayName} · {formatDate(item.createdAt, dateFormat)}
              </Text>
            </View>
            <View style={styles.actionRow}>
              <Text style={styles.meta}>
                ♥ {item.likeCount} · {item.postCount} {item.postCount === 1 ? "reply" : "replies"}
              </Text>
              <Pressable onPress={() => unsave(item.id)}>
                <Text style={styles.removeText}>Remove</Text>
              </Pressable>
            </View>
          </View>
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
    card: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      padding: spacing.lg,
      marginBottom: spacing.md,
    },
    cardTitle: { fontFamily: fonts.serifBold, fontSize: type.md, lineHeight: 24, color: colors.ink },
    byline: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.sm },
    actionRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginTop: spacing.md,
    },
    removeText: { color: colors.accent, fontFamily: fonts.displayMedium, fontSize: type.sm },
    meta: { color: colors.muted, fontFamily: fonts.sans, fontSize: type.sm },
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
