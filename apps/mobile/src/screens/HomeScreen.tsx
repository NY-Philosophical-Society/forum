import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useCallback, useMemo, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import { FlatList, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import {
  formatDate,
  type ChapterSummary,
  type TagWithCount,
  type ThreadFeedResponse,
  type ThreadSummary,
} from "@nyps-forum/shared";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth-context";
import { useSettings } from "../lib/settings-context";
import { fonts, radius, spacing, type, type ThemeColors } from "../lib/theme";
import type { FeedStackParamList } from "../navigation";
import { ThreadCard } from "../components/ThreadCard";

type Props = NativeStackScreenProps<FeedStackParamList, "Home">;

const PAGE_SIZE = 20;

export function HomeScreen({ navigation }: Props) {
  const { user, token, linkedNotice, clearLinkedNotice } = useAuth();
  const { colors, dateFormat } = useSettings();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [sort, setSort] = useState<"hot" | "new">("hot");
  const [activeTag, setActiveTag] = useState<string>("");
  const [tags, setTags] = useState<TagWithCount[] | null>(null);
  const [threads, setThreads] = useState<ThreadSummary[] | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAllTags, setShowAllTags] = useState(false);
  const [myChapters, setMyChapters] = useState<ChapterSummary[]>([]);
  const [events, setEvents] = useState<ThreadSummary[]>([]);

  const VISIBLE_TAG_COUNT = 6;
  const isMemberViewer = Boolean(user && (user.isSupporter || user.role === "admin"));

  const loadThreads = useCallback(() => {
    const qs = new URLSearchParams({ sort, limit: String(PAGE_SIZE), offset: "0" });
    if (activeTag) qs.set("tag", activeTag);
    api
      .get<ThreadFeedResponse>(`/api/threads?${qs.toString()}`, token)
      .then((res) => {
        setThreads(res.threads);
        setHasMore(res.hasMore);
      })
      .catch((e) => setError(e.message));
  }, [sort, activeTag, token]);

  useFocusEffect(
    useCallback(() => {
      api
        .get<{ tags: TagWithCount[] }>("/api/tags")
        .then((res) => setTags(res.tags))
        .catch((e) => setError(e.message));
      // The Events grouping rides above the feed; failures stay quiet — the
      // feed is the page, the strip is garnish.
      api
        .get<ThreadFeedResponse>("/api/threads?kind=event&limit=4", token)
        .then((res) => setEvents(res.threads))
        .catch(() => {});
      if (isMemberViewer) {
        api
          .get<{ chapters: ChapterSummary[] }>("/api/chapters", token)
          .then((res) => setMyChapters(res.chapters.filter((c) => c.myMembership === "active")))
          .catch(() => {});
      }
      loadThreads();
    }, [loadThreads, token, isMemberViewer]),
  );

  async function loadMore() {
    if (!threads) return;
    setLoadingMore(true);
    try {
      const qs = new URLSearchParams({
        sort,
        limit: String(PAGE_SIZE),
        offset: String(threads.length),
      });
      if (activeTag) qs.set("tag", activeTag);
      const res = await api.get<ThreadFeedResponse>(`/api/threads?${qs.toString()}`, token);
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

  // Optimistic, like the like toggle — reverted if the request fails. Saving
  // is a private reading aid, so any account may, verified or not.
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

  const canPost = Boolean(user?.canWrite);
  const activeTagName = tags?.find((t) => t.slug === activeTag)?.name;

  return (
    <View style={styles.container}>
      {linkedNotice && (
        <Pressable style={styles.toast} onPress={clearLinkedNotice}>
          <Text style={styles.toastText}>
            Signed in — this provider was linked to your existing account. Tap to dismiss.
          </Text>
        </Pressable>
      )}

      {isMemberViewer && (
        <View style={styles.chapterStrip}>
          <Text style={styles.chapterStripLabel}>CHAPTERS</Text>
          {myChapters.map((c) => (
            <Pressable key={c.id} onPress={() => navigation.navigate("Chapter", { slug: c.slug })}>
              <Text style={styles.chapterLink}>{c.name}</Text>
            </Pressable>
          ))}
          <Pressable onPress={() => navigation.navigate("Chapters")}>
            <Text style={styles.chapterLinkAll}>
              {myChapters.length > 0 ? "All ›" : "Browse ›"}
            </Text>
          </Pressable>
        </View>
      )}

      {events.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ marginBottom: spacing.md, flexGrow: 0 }}
        >
          {events.map((t) => {
            const upcoming = t.eventDate ? Date.parse(t.eventDate) > Date.now() : false;
            return (
              <Pressable
                key={t.id}
                style={styles.eventCard}
                onPress={() => navigation.navigate("Thread", { threadId: t.id })}
              >
                <Text style={styles.eventCardDate}>
                  {upcoming ? "UPCOMING · " : "EVENT · "}
                  {t.eventDate ? formatDate(t.eventDate, dateFormat) : ""}
                </Text>
                <Text style={styles.eventCardTitle} numberOfLines={2}>
                  {t.title}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      )}

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
        {canPost && (
          <Pressable style={styles.newButton} onPress={() => navigation.navigate("NewThread", {})}>
            <Text style={styles.newButtonText}>+ New thread</Text>
          </Pressable>
        )}
      </View>

      <View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ marginBottom: spacing.md, flexGrow: 0 }}
        >
          <Pressable
            style={[styles.chip, activeTag === "" && styles.chipActive]}
            onPress={() => setActiveTag("")}
          >
            <Text style={activeTag === "" ? styles.chipTextActive : styles.chipText}>All</Text>
          </Pressable>
          {(showAllTags ? tags : tags?.slice(0, VISIBLE_TAG_COUNT))?.map((t) => (
            <Pressable
              key={t.id}
              style={[styles.chip, activeTag === t.slug && styles.chipActive]}
              onPress={() => setActiveTag(t.slug)}
            >
              <Text style={activeTag === t.slug ? styles.chipTextActive : styles.chipText}>
                {t.name}
              </Text>
            </Pressable>
          ))}
          {tags && tags.length > VISIBLE_TAG_COUNT && (
            <Pressable style={styles.chip} onPress={() => setShowAllTags((v) => !v)}>
              <Text style={styles.chipText}>
                {showAllTags ? "Less" : `More +${tags.length - VISIBLE_TAG_COUNT}`}
              </Text>
            </Pressable>
          )}
        </ScrollView>
      </View>

      {error && <Text style={styles.error}>{error}</Text>}

      {threads === null && !error && (
        <View>
          {[0, 1, 2].map((i) => (
            <View key={i} style={styles.skeletonCard}>
              <View style={[styles.skeletonBar, { width: "75%" }]} />
              <View style={[styles.skeletonBar, { width: "40%", height: 10 }]} />
              <View style={[styles.skeletonBar, { width: 72, height: 22, borderRadius: radius.full }]} />
            </View>
          ))}
        </View>
      )}

      {threads?.length === 0 && (
        <View style={styles.empty}>
          <Text style={styles.emptyMark}>❦</Text>
          <Text style={styles.emptyTitle}>
            {activeTagName ? `Nothing under ${activeTagName} yet` : "The floor is open"}
          </Text>
          <Text style={styles.meta}>
            {activeTagName
              ? "No one has raised a question here — perhaps that's your opening."
              : "Every great discussion starts with someone willing to ask first."}
          </Text>
        </View>
      )}

      <FlatList
        data={threads ?? []}
        keyExtractor={(t) => t.id}
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
    container: { flex: 1, backgroundColor: colors.paper, padding: spacing.lg, paddingBottom: 0 },
    toast: {
      backgroundColor: colors.verifiedBg,
      borderWidth: 1,
      borderColor: colors.verifiedText,
      borderRadius: radius.sm,
      padding: spacing.md,
      marginBottom: spacing.md,
    },
    toastText: { color: colors.verifiedText, fontFamily: fonts.sans, fontSize: type.sm },
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
    newButton: {
      backgroundColor: colors.solid,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.lg,
      borderRadius: radius.sm,
    },
    newButtonText: { color: colors.solidText, fontFamily: fonts.displaySemi, fontSize: type.sm },
    chip: {
      borderWidth: 1,
      borderColor: colors.borderStrong,
      borderRadius: radius.full,
      paddingVertical: 5,
      paddingHorizontal: spacing.md,
      marginRight: spacing.sm,
      backgroundColor: "transparent",
    },
    chipActive: { backgroundColor: colors.solid, borderColor: colors.solid },
    chipText: { color: colors.ink, fontFamily: fonts.displayMedium, fontSize: type.sm },
    chipTextActive: { color: colors.solidText, fontFamily: fonts.displayMedium, fontSize: type.sm },
    error: { color: colors.danger, fontFamily: fonts.sans },
    meta: { color: colors.muted, fontFamily: fonts.sans, fontSize: type.sm },
    // Members' chapter row — one quiet line above the feed, never burying it.
    chapterStrip: {
      flexDirection: "row",
      flexWrap: "wrap",
      alignItems: "baseline",
      gap: spacing.md,
      paddingBottom: spacing.md,
      marginBottom: spacing.md,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    chapterStripLabel: {
      color: colors.muted,
      fontFamily: fonts.sans,
      fontSize: type.xs,
      letterSpacing: 2,
    },
    chapterLink: { color: colors.ink, fontFamily: fonts.displayMedium, fontSize: type.base },
    chapterLinkAll: { color: colors.muted, fontFamily: fonts.displayMedium, fontSize: type.sm },
    // The Events grouping.
    eventCard: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      padding: spacing.md,
      marginRight: spacing.sm,
      width: 210,
      gap: spacing.xs,
    },
    eventCardDate: {
      color: colors.accent,
      fontFamily: fonts.displaySemi,
      fontSize: type.xs,
      letterSpacing: 1,
    },
    eventCardTitle: {
      fontFamily: fonts.serif,
      fontSize: type.base,
      lineHeight: 20,
      color: colors.ink,
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
    skeletonCard: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      padding: spacing.lg,
      marginBottom: spacing.md,
      gap: spacing.md,
    },
    skeletonBar: { height: 14, borderRadius: radius.sm, backgroundColor: colors.stone2 },
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
