import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useCallback, useMemo, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
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
import { ReportButton } from "../components/ReportButton";

type Props = NativeStackScreenProps<FeedStackParamList, "Thread">;

const REPLIES_PAGE = 20;

export function ThreadScreen({ route }: Props) {
  const { threadId } = route.params;
  const { user, token } = useAuth();
  const { colors, dateFormat } = useSettings();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [thread, setThread] = useState<ThreadDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [replyBody, setReplyBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [repliesWindow, setRepliesWindow] = useState(REPLIES_PAGE);
  const [loadingMore, setLoadingMore] = useState(false);
  const [locking, setLocking] = useState(false);

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

  const canLike = user?.verificationStatus === "VERIFIED";
  const canPost = canLike && !thread.locked;
  const orderedPosts = flattenPostTree(thread.posts);

  return (
    <FlatList
      style={styles.container}
      data={orderedPosts}
      keyExtractor={(p) => p.id}
      ListHeaderComponent={
        <View>
          <Text style={styles.h1}>
            {thread.title}
            {thread.locked ? " 🔒" : ""}
          </Text>
          <View style={styles.byline}>
            <View style={styles.miniAvatar}>
              <Text style={styles.miniAvatarText}>
                {thread.author.displayName.charAt(0).toUpperCase()}
              </Text>
            </View>
            <Text style={styles.meta}>
              {thread.author.displayName} · {formatDate(thread.createdAt, dateFormat)}
            </Text>
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
          {user?.role === "admin" && (
            <Pressable style={styles.lockButton} onPress={toggleLock} disabled={locking}>
              <Text style={styles.lockButtonText}>
                {thread.locked ? "Unlock thread" : "Lock thread"}
              </Text>
            </Pressable>
          )}
          <View style={styles.card}>
            <Text style={styles.body}>{thread.body}</Text>
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
              <ReportButton targetType="thread" targetId={thread.id} />
            </View>
          </View>
          <Text style={styles.h2}>
            {thread.postCount} {thread.postCount === 1 ? "Reply" : "Replies"}
          </Text>
        </View>
      }
      renderItem={({ item }) => (
        <PostItem post={item} canLike={canLike} onLike={togglePostLike} />
      )}
      ListFooterComponent={
        <View style={{ marginTop: spacing.lg, paddingBottom: spacing.xl }}>
          {thread.hasMoreReplies && (
            <Pressable style={styles.loadMore} onPress={loadMoreReplies} disabled={loadingMore}>
              <Text style={styles.loadMoreText}>
                {loadingMore ? "Loading..." : "Load more replies"}
              </Text>
            </Pressable>
          )}
          {thread.locked ? (
            <Text style={styles.notice}>This thread is locked — no new replies.</Text>
          ) : canPost ? (
            <>
              <Text style={styles.label}>Add a reply</Text>
              <TextInput
                style={styles.textarea}
                multiline
                placeholder="Make your case..."
                placeholderTextColor={colors.muted}
                value={replyBody}
                onChangeText={setReplyBody}
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
  canLike,
  onLike,
}: {
  post: PostWithDepth;
  canLike: boolean;
  onLike: (postId: string) => void;
}) {
  const { colors, dateFormat } = useSettings();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <View style={[styles.post, { marginLeft: post.depth * spacing.lg }]}>
      <Text style={styles.body}>{post.body}</Text>
      <View style={styles.byline}>
        <View style={styles.miniAvatar}>
          <Text style={styles.miniAvatarText}>
            {post.author.displayName.charAt(0).toUpperCase()}
          </Text>
        </View>
        <Text style={styles.meta}>
          {post.author.displayName} · {formatDate(post.createdAt, dateFormat)}
        </Text>
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
    byline: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.sm },
    miniAvatar: {
      width: 22,
      height: 22,
      borderRadius: radius.full,
      backgroundColor: colors.solid,
      alignItems: "center",
      justifyContent: "center",
    },
    miniAvatarText: { color: colors.solidText, fontFamily: fonts.displaySemi, fontSize: 10 },
    meta: { color: colors.muted, fontFamily: fonts.sans, fontSize: type.sm },
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
    lockButton: {
      alignSelf: "flex-start",
      borderWidth: 1,
      borderColor: colors.borderStrong,
      borderRadius: radius.sm,
      paddingVertical: spacing.xs,
      paddingHorizontal: spacing.md,
      marginTop: spacing.md,
    },
    lockButtonText: { color: colors.ink, fontFamily: fonts.displayMedium, fontSize: type.sm },
    card: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      padding: spacing.lg,
      marginTop: spacing.md,
    },
    body: {
      fontFamily: fonts.sans,
      fontSize: type.base,
      lineHeight: 25,
      color: colors.ink,
    },
    post: {
      borderLeftWidth: 2,
      borderLeftColor: colors.border,
      paddingLeft: spacing.md,
      marginTop: spacing.lg,
    },
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
    textarea: {
      borderWidth: 1,
      borderColor: colors.borderStrong,
      borderRadius: radius.sm,
      padding: spacing.md,
      minHeight: 80,
      backgroundColor: colors.surface,
      color: colors.ink,
      fontFamily: fonts.sans,
      fontSize: type.base,
      textAlignVertical: "top",
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
