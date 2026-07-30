import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useFocusEffect } from "@react-navigation/native";
import { useCallback, useMemo, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import type { ChapterSummary, ThreadFeedResponse, ThreadSummary } from "@nyps-forum/shared";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth-context";
import { useSettings } from "../lib/settings-context";
import { fonts, radius, spacing, type, type ThemeColors } from "../lib/theme";
import type { FeedStackParamList } from "../navigation";
import { ThreadCard } from "../components/ThreadCard";

type Props = NativeStackScreenProps<FeedStackParamList, "Chapter">;

const PAGE_SIZE = 20;

/**
 * One chapter's feed — the same ThreadCard as the main feed, scoped to the
 * chapter. Members not yet in the chapter see its door (description + join
 * state); the API refuses their reads regardless.
 */
export function ChapterFeedScreen({ route, navigation }: Props) {
  const { slug } = route.params;
  const { user, token } = useAuth();
  const { colors } = useSettings();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [chapter, setChapter] = useState<ChapterSummary | null>(null);
  const [threads, setThreads] = useState<ThreadSummary[] | null>(null);
  const [sort, setSort] = useState<"hot" | "new">("hot");
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);

  const canRead = chapter?.myMembership === "active" || user?.role === "admin";

  useFocusEffect(
    useCallback(() => {
      if (!token) return;
      api
        .get<{ chapter: ChapterSummary }>(`/api/chapters/${slug}`, token)
        .then((res) => {
          setChapter(res.chapter);
          navigation.setOptions({ title: res.chapter.name });
        })
        .catch((e) => setError(e.message));
    }, [token, slug, navigation]),
  );

  useFocusEffect(
    useCallback(() => {
      if (!token || !canRead) return;
      api
        .get<ThreadFeedResponse>(
          `/api/chapters/${slug}/threads?sort=${sort}&limit=${PAGE_SIZE}&offset=0`,
          token,
        )
        .then((res) => {
          setThreads(res.threads);
          setHasMore(res.hasMore);
        })
        .catch((e) => setError(e.message));
    }, [token, slug, sort, canRead]),
  );

  async function requestJoin() {
    if (!token || !chapter) return;
    setJoining(true);
    try {
      const res = await api.post<{ state: "pending" | "active" }>(
        `/api/chapters/${slug}/join`,
        {},
        token,
      );
      setChapter({ ...chapter, myMembership: res.state });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setJoining(false);
    }
  }

  async function loadMore() {
    if (!token || !threads) return;
    setLoadingMore(true);
    try {
      const res = await api.get<ThreadFeedResponse>(
        `/api/chapters/${slug}/threads?sort=${sort}&limit=${PAGE_SIZE}&offset=${threads.length}`,
        token,
      );
      setThreads([...threads, ...res.threads]);
      setHasMore(res.hasMore);
    } finally {
      setLoadingMore(false);
    }
  }

  async function toggleLike(threadId: string) {
    if (!token) return;
    const res = await api.post<{ liked: boolean }>(`/api/threads/${threadId}/like`, {}, token);
    setThreads(
      (prev) =>
        prev?.map((t) =>
          t.id === threadId
            ? { ...t, myLiked: res.liked, likeCount: t.likeCount + (res.liked ? 1 : -1) }
            : t,
        ) ?? null,
    );
  }

  async function toggleBookmark(threadId: string, wasBookmarked: boolean) {
    if (!token) return;
    const apply = (bookmarked: boolean) =>
      setThreads(
        (prev) =>
          prev?.map((t) => (t.id === threadId ? { ...t, myBookmarked: bookmarked } : t)) ?? null,
      );
    apply(!wasBookmarked);
    try {
      if (wasBookmarked) await api.delete(`/api/bookmarks/${threadId}`, token);
      else await api.post("/api/bookmarks", { threadId }, token);
    } catch {
      apply(wasBookmarked);
    }
  }

  if (error && !chapter) {
    return (
      <View style={[styles.container, { padding: spacing.lg }]}>
        <Text style={styles.error}>{error}</Text>
      </View>
    );
  }
  if (!chapter) {
    return <View style={styles.container} />;
  }

  if (!canRead) {
    return (
      <View style={[styles.container, { padding: spacing.lg }]}>
        {chapter.description ? <Text style={styles.desc}>{chapter.description}</Text> : null}
        <View style={styles.door}>
          <Text style={styles.doorMark}>❦</Text>
          <Text style={styles.doorTitle}>
            {chapter.myMembership === "pending"
              ? "Your request is with the admins"
              : "A private space for this chapter"}
          </Text>
          <Text style={[styles.meta, { textAlign: "center" }]}>
            {chapter.myMembership === "pending"
              ? "You'll be able to read and post here as soon as an admin approves it."
              : "Chapter discussions are visible to its members only."}
          </Text>
          {chapter.myMembership === "none" && (
            <Pressable style={styles.button} disabled={joining} onPress={requestJoin}>
              <Text style={styles.buttonText}>{joining ? "Requesting..." : "Request to join"}</Text>
            </Pressable>
          )}
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { padding: spacing.lg, paddingBottom: 0 }]}>
      {chapter.description ? <Text style={styles.desc}>{chapter.description}</Text> : null}
      <Text style={[styles.meta, { marginBottom: spacing.md }]}>
        {chapter.location ? `${chapter.location} · ` : ""}
        {chapter.memberCount} {chapter.memberCount === 1 ? "member" : "members"}
      </Text>

      <View style={styles.controls}>
        <View style={styles.segmented}>
          <Pressable
            style={[styles.segment, sort === "hot" && styles.segmentActive]}
            onPress={() => setSort("hot")}
          >
            <Text style={sort === "hot" ? styles.segmentTextActive : styles.segmentText}>Hot</Text>
          </Pressable>
          <Pressable
            style={[styles.segment, sort === "new" && styles.segmentActive]}
            onPress={() => setSort("new")}
          >
            <Text style={sort === "new" ? styles.segmentTextActive : styles.segmentText}>New</Text>
          </Pressable>
        </View>
        {user?.canWrite && (
          <Pressable
            style={styles.button}
            onPress={() =>
              navigation.navigate("NewThread", { chapterId: chapter.id, chapterName: chapter.name })
            }
          >
            <Text style={styles.buttonText}>+ New thread</Text>
          </Pressable>
        )}
      </View>

      {error && <Text style={styles.error}>{error}</Text>}

      <FlatList
        data={threads ?? []}
        keyExtractor={(t) => t.id}
        ListEmptyComponent={
          threads ? (
            <View style={styles.door}>
              <Text style={styles.doorMark}>❦</Text>
              <Text style={styles.doorTitle}>Nothing here yet</Text>
              <Text style={styles.meta}>The chapter&apos;s first thread is waiting to be written.</Text>
            </View>
          ) : null
        }
        renderItem={({ item }) => (
          <ThreadCard
            thread={item}
            onPress={() => navigation.navigate("Thread", { threadId: item.id })}
            onAuthorPress={() => navigation.navigate("UserProfile", { userId: item.author.id })}
            onLike={() => toggleLike(item.id)}
            onBookmark={() => toggleBookmark(item.id, Boolean(item.myBookmarked))}
          />
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
    container: { flex: 1, backgroundColor: colors.paper },
    error: { color: colors.danger, fontFamily: fonts.sans, marginBottom: spacing.md },
    meta: { color: colors.muted, fontFamily: fonts.sans, fontSize: type.sm },
    desc: {
      fontFamily: fonts.sans,
      fontSize: type.base,
      lineHeight: 22,
      color: colors.ink,
      marginBottom: spacing.xs,
    },
    controls: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: spacing.md,
    },
    segmented: {
      flexDirection: "row",
      backgroundColor: colors.stone2,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.full,
      padding: 3,
    },
    segment: { paddingVertical: 6, paddingHorizontal: spacing.lg, borderRadius: radius.full },
    segmentActive: { backgroundColor: colors.surface },
    segmentText: { color: colors.muted, fontFamily: fonts.displaySemi, fontSize: type.sm },
    segmentTextActive: { color: colors.ink, fontFamily: fonts.displaySemi, fontSize: type.sm },
    button: {
      backgroundColor: colors.solid,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.lg,
      borderRadius: radius.sm,
      alignSelf: "center",
    },
    buttonText: { color: colors.solidText, fontFamily: fonts.displaySemi, fontSize: type.sm },
    door: { alignItems: "center", paddingVertical: spacing.xxl, gap: spacing.sm },
    doorMark: { color: colors.accent, fontSize: 28 },
    doorTitle: {
      fontFamily: fonts.serifBold,
      fontSize: type.lg,
      color: colors.ink,
      textAlign: "center",
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
  });
}
