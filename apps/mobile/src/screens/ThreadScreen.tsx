import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import {
  flattenPostTree,
  formatDate,
  type PostWithDepth,
  type ThreadDetail,
} from "@nyps-forum/shared";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth-context";
import { useSettings } from "../lib/settings-context";
import { fonts, radius, spacing, type, type ThemeColors } from "../lib/theme";
import type { FeedStackParamList } from "../navigation";
import { Avatar } from "../components/Avatar";
import { Markdown } from "../components/Markdown";
import { MarkdownComposer } from "../components/MarkdownComposer";
import { ReportButton } from "../components/ReportButton";

type Props = NativeStackScreenProps<FeedStackParamList, "Thread">;

const REPLIES_PAGE = 20;
// Notification/search deep links may point past the first page of replies,
// so those arrivals load with the maximum window instead (same as web).
const DEEP_LINK_REPLIES = 100;

export function ThreadScreen({ route, navigation }: Props) {
  const { threadId, highlightPostId } = route.params;
  const { user, token } = useAuth();
  const { colors, dateFormat } = useSettings();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [thread, setThread] = useState<ThreadDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [replyBody, setReplyBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [repliesWindow, setRepliesWindow] = useState(
    highlightPostId ? DEEP_LINK_REPLIES : REPLIES_PAGE,
  );
  const listRef = useRef<FlatList<PostWithDepth>>(null);
  const scrolledToHighlight = useRef(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [locking, setLocking] = useState(false);
  const [editingPostId, setEditingPostId] = useState<string | null>(null);
  const [editingBody, setEditingBody] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(
    (window: number) => {
      api
        .get<{ thread: ThreadDetail }>(
          `/api/threads/${threadId}?repliesLimit=${window}&repliesOffset=0`,
          token,
        )
        .then((res) => setThread(res.thread))
        .catch((e) => setError(e.message));
    },
    [threadId, token],
  );

  useFocusEffect(
    useCallback(() => {
      load(repliesWindow);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [load]),
  );

  // Replies render after an async load, so scroll to the deep-linked reply
  // once — after the list has had a moment to lay its rows out.
  useEffect(() => {
    if (!thread || !highlightPostId || scrolledToHighlight.current) return;
    const index = flattenPostTree(thread.posts).findIndex((p) => p.id === highlightPostId);
    if (index < 0) return;
    scrolledToHighlight.current = true;
    const timer = setTimeout(
      () => listRef.current?.scrollToIndex({ index, viewPosition: 0.3, animated: false }),
      300,
    );
    return () => clearTimeout(timer);
  }, [thread, highlightPostId]);

  async function loadMoreReplies() {
    setLoadingMore(true);
    const nextWindow = repliesWindow + REPLIES_PAGE;
    load(nextWindow);
    setRepliesWindow(nextWindow);
    setLoadingMore(false);
  }

  async function toggleThreadLike() {
    if (!token) return;
    await api.post(`/api/threads/${threadId}/like`, {}, token);
    load(repliesWindow);
  }

  // Optimistic, reverted on failure. Any account may save — it's a private
  // reading aid, not a write action, so it isn't gated on verification.
  async function toggleBookmark() {
    if (!token || !thread) return;
    const wasBookmarked = Boolean(thread.myBookmarked);
    setThread({ ...thread, myBookmarked: !wasBookmarked });
    try {
      if (wasBookmarked) await api.delete(`/api/bookmarks/${threadId}`, token);
      else await api.post("/api/bookmarks", { threadId }, token);
    } catch {
      setThread((prev) => (prev ? { ...prev, myBookmarked: wasBookmarked } : prev));
    }
  }

  async function togglePostLike(postId: string) {
    if (!token) return;
    await api.post(`/api/posts/${postId}/like`, {}, token);
    load(repliesWindow);
  }

  async function toggleLock() {
    if (!token) return;
    setLocking(true);
    try {
      await api.post(`/api/threads/${threadId}/lock`, {}, token);
      load(repliesWindow);
    } finally {
      setLocking(false);
    }
  }

  function confirmDeleteThread() {
    const hasReplies = (thread?.postCount ?? 0) > 0;
    Alert.alert(
      "Delete thread?",
      hasReplies
        ? "Your title and text are removed; existing replies stay readable under a [deleted] notice."
        : "This can't be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            if (!token) return;
            try {
              await api.delete(`/api/threads/${threadId}`, token);
              navigation.goBack();
            } catch (err: any) {
              Alert.alert("Could not delete", err.message);
            }
          },
        },
      ],
    );
  }

  function confirmDeletePost(postId: string) {
    Alert.alert(
      "Delete reply?",
      "Replies to it will stay under a [deleted] notice.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            if (!token) return;
            try {
              await api.delete(`/api/posts/${postId}`, token);
              load(repliesWindow);
            } catch (err: any) {
              Alert.alert("Could not delete", err.message);
            }
          },
        },
      ],
    );
  }

  async function savePostEdit(postId: string) {
    if (!token || !editingBody.trim()) return;
    setSaving(true);
    try {
      await api.patch(`/api/posts/${postId}`, { body: editingBody }, token);
      setEditingPostId(null);
      load(repliesWindow);
    } catch (err: any) {
      Alert.alert("Could not save", err.message);
    } finally {
      setSaving(false);
    }
  }

  async function submitReply() {
    if (!token || !replyBody.trim()) return;
    setSubmitting(true);
    try {
      await api.post("/api/posts", { threadId, body: replyBody }, token);
      setReplyBody("");
      const nextWindow = repliesWindow + 1;
      load(nextWindow);
      setRepliesWindow(nextWindow);
    } finally {
      setSubmitting(false);
    }
  }

  if (error) {
    return (
      <View style={styles.container}>
        <Text style={styles.error}>{error}</Text>
      </View>
    );
  }

  if (!thread) {
    return (
      <View style={styles.container}>
        <View style={[styles.skeletonBar, { width: "85%", height: 20 }]} />
        <View style={[styles.skeletonBar, { width: "40%" }]} />
        <View style={styles.card}>
          <View style={[styles.skeletonBar, { width: "100%" }]} />
          <View style={[styles.skeletonBar, { width: "90%" }]} />
          <View style={[styles.skeletonBar, { width: "55%" }]} />
        </View>
      </View>
    );
  }

  const isAdmin = user?.role === "admin";
  const canLike = user?.verificationStatus === "VERIFIED";
  const canPost = canLike && !thread.locked && !thread.deleted;
  const canEditThread =
    !thread.deleted &&
    Boolean(user) &&
    (isAdmin || (user!.id === thread.author.id && user!.verificationStatus === "VERIFIED"));
  const orderedPosts = flattenPostTree(thread.posts);

  return (
    <FlatList
      ref={listRef}
      style={styles.container}
      data={orderedPosts}
      keyExtractor={(p) => p.id}
      // Far-down rows aren't measured yet — estimate, then retry precisely.
      onScrollToIndexFailed={({ index, averageItemLength }) => {
        listRef.current?.scrollToOffset({ offset: averageItemLength * index, animated: false });
        setTimeout(
          () => listRef.current?.scrollToIndex({ index, viewPosition: 0.3, animated: false }),
          250,
        );
      }}
      ListHeaderComponent={
        <View>
          <Text style={styles.h1}>
            {thread.title}
            {thread.locked ? " 🔒" : ""}
          </Text>
          <View style={styles.byline}>
            {thread.author.id ? (
              <Pressable
                style={[styles.byline, { marginTop: 0 }]}
                onPress={() => navigation.navigate("UserProfile", { userId: thread.author.id })}
              >
                <Avatar name={thread.author.displayName} uri={thread.author.avatarUrl} size={22} />
                <Text style={styles.meta}>{thread.author.displayName}</Text>
              </Pressable>
            ) : (
              <Text style={styles.meta}>{thread.author.displayName}</Text>
            )}
            <Text style={styles.meta}>· {formatDate(thread.createdAt, dateFormat)}</Text>
            {thread.editedAt && (
              <Text style={styles.editedNote}>edited {formatDate(thread.editedAt, dateFormat)}</Text>
            )}
          </View>
          {thread.tags.length > 0 && (
            <View style={styles.tagRow}>
              {thread.tags.map((t) => (
                <View key={t.id} style={styles.tagPill}>
                  <Text style={styles.tagPillText}>{t.name.toUpperCase()}</Text>
                </View>
              ))}
            </View>
          )}
          {(canEditThread || isAdmin) && (
            <View style={styles.actionRow}>
              {canEditThread && (
                <>
                  <Pressable
                    style={styles.actionButton}
                    onPress={() =>
                      navigation.navigate("EditThread", {
                        threadId: thread.id,
                        title: thread.title,
                        body: thread.body,
                        tagIds: thread.tags.map((t) => t.id),
                      })
                    }
                  >
                    <Text style={styles.actionButtonText}>Edit</Text>
                  </Pressable>
                  <Pressable style={styles.actionButton} onPress={confirmDeleteThread}>
                    <Text style={styles.actionButtonText}>Delete</Text>
                  </Pressable>
                </>
              )}
              {isAdmin && (
                <Pressable style={styles.actionButton} onPress={toggleLock} disabled={locking}>
                  <Text style={styles.actionButtonText}>
                    {thread.locked ? "Unlock thread" : "Lock thread"}
                  </Text>
                </Pressable>
              )}
            </View>
          )}
          <View style={styles.card}>
            {thread.deleted ? (
              <Text style={styles.tombstone}>
                This thread was deleted. The replies below are preserved.
              </Text>
            ) : (
              <>
                <Markdown>{thread.body}</Markdown>
                <View style={styles.likeRow}>
                  <Pressable
                    style={[styles.likeButton, thread.myLiked && styles.likeButtonActive]}
                    disabled={!canLike}
                    onPress={toggleThreadLike}
                  >
                    <Text style={thread.myLiked ? styles.likeTextActive : styles.likeText}>
                      ♥ {thread.likeCount}
                    </Text>
                  </Pressable>
                  <Pressable onPress={toggleBookmark}>
                    <Text style={thread.myBookmarked ? styles.saveTextActive : styles.saveText}>
                      {thread.myBookmarked ? "❧ Saved" : "❧ Save"}
                    </Text>
                  </Pressable>
                  <ReportButton targetType="thread" targetId={thread.id} />
                </View>
              </>
            )}
          </View>
          <Text style={styles.h2}>
            {thread.postCount} {thread.postCount === 1 ? "Reply" : "Replies"}
          </Text>
        </View>
      }
      renderItem={({ item }) =>
        editingPostId === item.id ? (
          <View style={[styles.post, { marginLeft: item.depth * spacing.lg }]}>
            <MarkdownComposer value={editingBody} onChange={setEditingBody} minHeight={100} />
            <View style={styles.actionRow}>
              <Pressable
                style={styles.actionButton}
                onPress={() => savePostEdit(item.id)}
                disabled={saving}
              >
                <Text style={styles.actionButtonText}>{saving ? "Saving..." : "Save"}</Text>
              </Pressable>
              <Pressable
                style={styles.actionButton}
                onPress={() => setEditingPostId(null)}
                disabled={saving}
              >
                <Text style={styles.actionButtonText}>Cancel</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <PostItem
            post={item}
            highlighted={item.id === highlightPostId}
            canLike={canLike}
            canModify={Boolean(
              user &&
                !item.deleted &&
                (isAdmin || (user.id === item.author.id && user.verificationStatus === "VERIFIED")),
            )}
            onLike={togglePostLike}
            onEdit={(p) => {
              setEditingPostId(p.id);
              setEditingBody(p.body);
            }}
            onDelete={confirmDeletePost}
            onAuthorPress={(userId) => navigation.navigate("UserProfile", { userId })}
          />
        )
      }
      ListFooterComponent={
        <View style={{ marginTop: spacing.lg, paddingBottom: spacing.xl }}>
          {thread.hasMoreReplies && (
            <Pressable style={styles.loadMore} onPress={loadMoreReplies} disabled={loadingMore}>
              <Text style={styles.loadMoreText}>
                {loadingMore ? "Loading..." : "Load more replies"}
              </Text>
            </Pressable>
          )}
          {thread.deleted ? (
            <Text style={styles.notice}>This thread was deleted — no new replies.</Text>
          ) : thread.locked ? (
            <Text style={styles.notice}>This thread is locked — no new replies.</Text>
          ) : canPost ? (
            <>
              <Text style={styles.label}>Add a reply</Text>
              <MarkdownComposer
                value={replyBody}
                onChange={setReplyBody}
                placeholder="Make your case..."
                minHeight={80}
              />
              <Pressable style={styles.button} onPress={submitReply} disabled={submitting}>
                <Text style={styles.buttonText}>{submitting ? "Posting..." : "Post reply"}</Text>
              </Pressable>
            </>
          ) : (
            <Text style={styles.notice}>
              Verify your identity from the Profile tab to reply and like.
            </Text>
          )}
        </View>
      }
    />
  );
}

function PostItem({
  post,
  highlighted,
  canLike,
  canModify,
  onLike,
  onEdit,
  onDelete,
  onAuthorPress,
}: {
  post: PostWithDepth;
  /** The reply a notification/search deep link points at — accent hairline. */
  highlighted: boolean;
  canLike: boolean;
  canModify: boolean;
  onLike: (postId: string) => void;
  onEdit: (post: PostWithDepth) => void;
  onDelete: (postId: string) => void;
  onAuthorPress: (userId: string) => void;
}) {
  const { colors, dateFormat } = useSettings();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  if (post.deleted) {
    return (
      <View style={[styles.post, { marginLeft: post.depth * spacing.lg }]}>
        <Text style={styles.tombstone}>[deleted]</Text>
        <View style={styles.byline}>
          <Text style={styles.meta}>· {formatDate(post.createdAt, dateFormat)}</Text>
        </View>
      </View>
    );
  }

  return (
    <View
      style={[
        styles.post,
        highlighted && styles.postHighlighted,
        { marginLeft: post.depth * spacing.lg },
      ]}
    >
      <Markdown>{post.body}</Markdown>
      <View style={styles.byline}>
        <Pressable
          style={[styles.byline, { marginTop: 0 }]}
          onPress={() => onAuthorPress(post.author.id)}
        >
          <Avatar name={post.author.displayName} uri={post.author.avatarUrl} size={22} />
          <Text style={styles.meta}>{post.author.displayName}</Text>
        </Pressable>
        <Text style={styles.meta}>· {formatDate(post.createdAt, dateFormat)}</Text>
        {post.editedAt && (
          <Text style={styles.editedNote}>edited {formatDate(post.editedAt, dateFormat)}</Text>
        )}
      </View>
      <View style={styles.likeRow}>
        <Pressable
          style={[styles.likeButton, post.myLiked && styles.likeButtonActive]}
          disabled={!canLike}
          onPress={() => onLike(post.id)}
        >
          <Text style={post.myLiked ? styles.likeTextActive : styles.likeText}>
            ♥ {post.likeCount}
          </Text>
        </Pressable>
        {canModify && (
          <>
            <Pressable onPress={() => onEdit(post)}>
              <Text style={styles.linkAction}>Edit</Text>
            </Pressable>
            <Pressable onPress={() => onDelete(post.id)}>
              <Text style={styles.linkAction}>Delete</Text>
            </Pressable>
          </>
        )}
        <ReportButton targetType="post" targetId={post.id} />
      </View>
    </View>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.paper, padding: spacing.lg },
    h1: { fontFamily: fonts.serifBold, fontSize: type.lg, lineHeight: 28, color: colors.ink },
    h2: {
      fontFamily: fonts.serifBold,
      fontSize: type.md,
      color: colors.ink,
      marginTop: spacing.xl,
      marginBottom: spacing.xs,
    },
    byline: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      marginTop: spacing.sm,
      flexWrap: "wrap",
    },
    meta: { color: colors.muted, fontFamily: fonts.sans, fontSize: type.sm },
    editedNote: {
      color: colors.muted,
      fontFamily: fonts.sans,
      fontSize: type.xs,
      fontStyle: "italic",
    },
    tombstone: {
      color: colors.muted,
      fontFamily: fonts.sans,
      fontSize: type.base,
      fontStyle: "italic",
    },
    error: { color: colors.danger, fontFamily: fonts.sans },
    tagRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs, marginTop: spacing.md },
    tagPill: {
      backgroundColor: colors.stone2,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.full,
      paddingVertical: 2,
      paddingHorizontal: spacing.sm,
    },
    tagPillText: {
      fontFamily: fonts.displaySemi,
      fontSize: type.xs,
      color: colors.inkSoft,
      letterSpacing: 0.5,
    },
    actionRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md, flexWrap: "wrap" },
    actionButton: {
      alignSelf: "flex-start",
      borderWidth: 1,
      borderColor: colors.borderStrong,
      borderRadius: radius.sm,
      paddingVertical: spacing.xs,
      paddingHorizontal: spacing.md,
    },
    actionButtonText: { color: colors.ink, fontFamily: fonts.displayMedium, fontSize: type.sm },
    linkAction: { color: colors.muted, fontFamily: fonts.displayMedium, fontSize: type.sm },
    card: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      padding: spacing.lg,
      marginTop: spacing.md,
    },
    post: {
      borderLeftWidth: 2,
      borderLeftColor: colors.border,
      paddingLeft: spacing.md,
      marginTop: spacing.lg,
    },
    postHighlighted: { borderLeftColor: colors.accent },
    likeRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginTop: spacing.md, flexWrap: "wrap" },
    likeButton: {
      borderWidth: 1,
      borderColor: colors.borderStrong,
      borderRadius: radius.full,
      paddingVertical: 3,
      paddingHorizontal: spacing.md,
    },
    likeButtonActive: { backgroundColor: colors.accentBg, borderColor: colors.supporterBorder },
    likeText: { color: colors.muted, fontFamily: fonts.displayMedium, fontSize: type.sm },
    likeTextActive: { color: colors.accent, fontFamily: fonts.displaySemi, fontSize: type.sm },
    saveText: { color: colors.muted, fontFamily: fonts.displayMedium, fontSize: type.sm },
    saveTextActive: { color: colors.accent, fontFamily: fonts.displaySemi, fontSize: type.sm },
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
    notice: {
      backgroundColor: colors.pendingBg,
      color: colors.pendingText,
      fontFamily: fonts.sans,
      fontSize: type.sm,
      padding: spacing.md,
      borderRadius: radius.sm,
    },
    label: {
      fontFamily: fonts.displaySemi,
      fontSize: type.sm,
      color: colors.ink,
      marginBottom: spacing.xs,
    },
    button: {
      backgroundColor: colors.solid,
      paddingVertical: spacing.md,
      borderRadius: radius.sm,
      alignItems: "center",
      marginTop: spacing.md,
      alignSelf: "flex-start",
      paddingHorizontal: spacing.xl,
    },
    buttonText: { color: colors.solidText, fontFamily: fonts.displaySemi, fontSize: type.sm },
    skeletonBar: {
      height: 14,
      borderRadius: radius.sm,
      backgroundColor: colors.stone2,
      marginBottom: spacing.md,
    },
  });
}
