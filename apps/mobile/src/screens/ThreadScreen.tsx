import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useCallback, useMemo, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { flattenPostTree, formatDate, type PostWithDepth, type ThreadDetail } from "@nyps-forum/shared";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth-context";
import { useSettings } from "../lib/settings-context";
import type { ThemeColors } from "../lib/theme";
import type { RootStackParamList } from "../navigation";

type Props = NativeStackScreenProps<RootStackParamList, "Thread">;

export function ThreadScreen({ route }: Props) {
  const { threadId } = route.params;
  const { user, token } = useAuth();
  const { colors, dateFormat } = useSettings();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [thread, setThread] = useState<ThreadDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [replyBody, setReplyBody] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(() => {
    api
      .get<{ thread: ThreadDetail }>(`/api/threads/${threadId}`, token)
      .then((res) => setThread(res.thread))
      .catch((e) => setError(e.message));
  }, [threadId, token]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function toggleThreadLike() {
    if (!token) return;
    await api.post(`/api/threads/${threadId}/like`, {}, token);
    load();
  }

  async function togglePostLike(postId: string) {
    if (!token) return;
    await api.post(`/api/posts/${postId}/like`, {}, token);
    load();
  }

  async function submitReply() {
    if (!token || !replyBody.trim()) return;
    setSubmitting(true);
    try {
      await api.post("/api/posts", { threadId, body: replyBody }, token);
      setReplyBody("");
      load();
    } finally {
      setSubmitting(false);
    }
  }

  if (error) return <Text style={styles.error}>{error}</Text>;
  if (!thread) return <Text style={styles.meta}>Loading...</Text>;

  const canPost = user?.verificationStatus === "VERIFIED";
  const orderedPosts = flattenPostTree(thread.posts);

  return (
    <FlatList
      style={styles.container}
      data={orderedPosts}
      keyExtractor={(p) => p.id}
      ListHeaderComponent={
        <View>
          <Text style={styles.h1}>{thread.title}</Text>
          <Text style={styles.meta}>
            by {thread.author.displayName} · {formatDate(thread.createdAt, dateFormat)}
          </Text>
          {thread.tags.length > 0 && (
            <View style={styles.tagRow}>
              {thread.tags.map((t) => (
                <View key={t.id} style={styles.tagPill}>
                  <Text style={styles.tagPillText}>{t.name}</Text>
                </View>
              ))}
            </View>
          )}
          <View style={styles.card}>
            <Text style={{ color: colors.ink }}>{thread.body}</Text>
            <Pressable
              style={[styles.likeButton, thread.myLiked && styles.likeButtonActive]}
              disabled={!canPost}
              onPress={toggleThreadLike}
            >
              <Text style={thread.myLiked ? styles.likeTextActive : styles.likeText}>
                ♥ {thread.likeCount}
              </Text>
            </Pressable>
          </View>
          <Text style={styles.h2}>{thread.posts.length} Replies</Text>
        </View>
      }
      renderItem={({ item }) => (
        <PostItem post={item} canLike={canPost} onLike={togglePostLike} />
      )}
      ListFooterComponent={
        <View style={{ marginTop: 16 }}>
          {canPost ? (
            <>
              <Text style={styles.label}>Add a reply</Text>
              <TextInput
                style={styles.textarea}
                multiline
                value={replyBody}
                onChangeText={setReplyBody}
              />
              <Pressable style={styles.button} onPress={submitReply} disabled={submitting}>
                <Text style={styles.buttonText}>{submitting ? "Posting..." : "Post reply"}</Text>
              </Pressable>
            </>
          ) : (
            <Text style={styles.notice}>
              {user ? "Verify your identity" : "Log in"} to reply and like.
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
    <View style={[styles.post, { marginLeft: post.depth * 16 }]}>
      <Text style={{ color: colors.ink }}>{post.body}</Text>
      <Text style={styles.meta}>
        {post.author.displayName} · {formatDate(post.createdAt, dateFormat)}
      </Text>
      <Pressable
        style={[styles.likeButton, post.myLiked && styles.likeButtonActive]}
        disabled={!canLike}
        onPress={() => onLike(post.id)}
      >
        <Text style={post.myLiked ? styles.likeTextActive : styles.likeText}>
          ♥ {post.likeCount}
        </Text>
      </Pressable>
    </View>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.paper, padding: 16 },
    h1: { fontSize: 20, fontWeight: "700", color: colors.ink },
    h2: { fontSize: 16, fontWeight: "700", color: colors.ink, marginTop: 16, marginBottom: 4 },
    meta: { color: colors.muted, fontSize: 12, marginTop: 4 },
    error: { color: colors.danger, padding: 16 },
    tagRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 6 },
    tagPill: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 999,
      paddingVertical: 2,
      paddingHorizontal: 8,
    },
    tagPillText: { fontSize: 11, color: colors.ink },
    card: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 8,
      padding: 12,
      marginTop: 8,
      backgroundColor: colors.surface,
    },
    post: {
      borderLeftWidth: 3,
      borderLeftColor: colors.border,
      paddingLeft: 12,
      marginTop: 12,
    },
    likeButton: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 999,
      paddingVertical: 3,
      paddingHorizontal: 10,
      marginTop: 8,
      alignSelf: "flex-start",
    },
    likeButtonActive: { backgroundColor: colors.rejectedBg, borderColor: colors.rejectedBorder },
    likeText: { color: colors.ink, fontSize: 13 },
    likeTextActive: { color: colors.danger, fontSize: 13, fontWeight: "700" },
    notice: {
      backgroundColor: colors.pendingBg,
      color: colors.pendingText,
      padding: 10,
      borderRadius: 6,
    },
    label: { fontWeight: "700", color: colors.ink, marginBottom: 4 },
    textarea: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 6,
      padding: 10,
      minHeight: 80,
      backgroundColor: colors.surface,
      color: colors.ink,
      textAlignVertical: "top",
    },
    button: {
      backgroundColor: colors.solid,
      paddingVertical: 10,
      borderRadius: 6,
      alignItems: "center",
      marginTop: 8,
      alignSelf: "flex-start",
      paddingHorizontal: 16,
    },
    buttonText: { color: colors.solidText, fontWeight: "700" },
  });
}
