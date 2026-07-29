import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useCallback, useMemo, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import type { ConversationResponse, DirectMessage } from "@nyps-forum/shared";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth-context";
import { useSettings } from "../lib/settings-context";
import { fonts, radius, spacing, type, type ThemeColors } from "../lib/theme";
import type { MessagesStackParamList } from "../navigation";
import { ReportButton } from "../components/ReportButton";

type Props = NativeStackScreenProps<MessagesStackParamList, "Conversation">;

const MESSAGES_PAGE = 30;

export function ConversationScreen({ route, navigation }: Props) {
  const { userId } = route.params;
  const { user, token } = useAuth();
  const { colors } = useSettings();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [messages, setMessages] = useState<DirectMessage[] | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [messagesWindow, setMessagesWindow] = useState(MESSAGES_PAGE);
  const [loadingMore, setLoadingMore] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const load = useCallback(
    (window: number) => {
      if (!token) return;
      api
        .get<ConversationResponse>(`/api/messages/${userId}?limit=${window}&offset=0`, token)
        .then((res) => {
          setMessages(res.messages);
          setHasMore(res.hasMore);
        })
        .catch((e) => setError(e.message));
    },
    [userId, token],
  );

  useFocusEffect(
    useCallback(() => {
      load(messagesWindow);
      api
        .get<{ blocked: boolean }>(`/api/users/${userId}/block`, token)
        .then((res) => setBlocked(res.blocked))
        .catch(() => {});
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [load, userId, token]),
  );

  async function loadOlder() {
    setLoadingMore(true);
    const nextWindow = messagesWindow + MESSAGES_PAGE;
    load(nextWindow);
    setMessagesWindow(nextWindow);
    setLoadingMore(false);
  }

  async function toggleBlock() {
    if (!token) return;
    if (blocked) {
      await api.delete(`/api/users/${userId}/block`, token);
      setBlocked(false);
    } else {
      await api.post(`/api/users/${userId}/block`, {}, token);
      setBlocked(true);
    }
  }

  async function send() {
    if (!token || !body.trim()) return;
    setSending(true);
    setError(null);
    try {
      await api.post("/api/messages", { recipientId: userId, body }, token);
      setBody("");
      load(messagesWindow);
    } catch (err: any) {
      setError(err.message ?? "Could not send message");
    } finally {
      setSending(false);
    }
  }

  const canSend = user?.verificationStatus === "VERIFIED" && !blocked;

  return (
    <View style={styles.container}>
      <View style={styles.actions}>
        <Pressable onPress={() => navigation.navigate("UserProfile", { userId })}>
          <Text style={styles.linkText}>View profile</Text>
        </Pressable>
        <ReportButton targetType="user" targetId={userId} />
        <Pressable onPress={toggleBlock}>
          <Text style={styles.linkText}>{blocked ? "Unblock" : "Block"}</Text>
        </Pressable>
      </View>

      {blocked && (
        <Text style={styles.notice}>
          You&apos;ve blocked this user — unblock them to exchange messages again.
        </Text>
      )}

      {hasMore && (
        <Pressable style={styles.loadMore} onPress={loadOlder} disabled={loadingMore}>
          <Text style={styles.loadMoreText}>
            {loadingMore ? "Loading..." : "Load older messages"}
          </Text>
        </Pressable>
      )}

      {messages?.length === 0 && (
        <View style={styles.empty}>
          <Text style={styles.emptyMark}>❦</Text>
          <Text style={styles.emptyTitle}>No messages yet</Text>
          <Text style={styles.meta}>Open with a question worth answering.</Text>
        </View>
      )}

      <FlatList
        data={messages ?? []}
        keyExtractor={(m) => m.id}
        style={{ flex: 1 }}
        renderItem={({ item }) => (
          <View
            style={[
              styles.bubble,
              item.senderId === user?.id ? styles.bubbleMine : styles.bubbleTheirs,
            ]}
          >
            <Text
              style={item.senderId === user?.id ? styles.bubbleTextMine : styles.bubbleTextTheirs}
            >
              {item.body}
            </Text>
          </View>
        )}
      />

      {canSend ? (
        <View style={styles.composeRow}>
          <TextInput
            style={styles.input}
            value={body}
            onChangeText={setBody}
            placeholder="Message"
            placeholderTextColor={colors.muted}
          />
          <Pressable style={styles.button} onPress={send} disabled={sending}>
            <Text style={styles.buttonText}>{sending ? "..." : "Send"}</Text>
          </Pressable>
        </View>
      ) : (
        !blocked && (
          <Text style={styles.notice}>
            Verify your identity from the Profile tab to send messages.
          </Text>
        )
      )}
      {error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.paper, padding: spacing.lg },
    actions: {
      flexDirection: "row",
      justifyContent: "flex-end",
      alignItems: "center",
      gap: spacing.lg,
      marginBottom: spacing.md,
    },
    linkText: {
      color: colors.muted,
      fontFamily: fonts.sans,
      fontSize: type.sm,
      textDecorationLine: "underline",
    },
    bubble: {
      maxWidth: "78%",
      padding: spacing.md,
      borderRadius: radius.lg,
      marginBottom: spacing.sm,
    },
    bubbleMine: {
      backgroundColor: colors.solid,
      alignSelf: "flex-end",
      borderBottomRightRadius: radius.sm,
    },
    bubbleTheirs: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      alignSelf: "flex-start",
      borderBottomLeftRadius: radius.sm,
    },
    bubbleTextMine: { color: colors.solidText, fontFamily: fonts.sans, fontSize: type.base, lineHeight: 22 },
    bubbleTextTheirs: { color: colors.ink, fontFamily: fonts.sans, fontSize: type.base, lineHeight: 22 },
    composeRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm, alignItems: "center" },
    input: {
      flex: 1,
      borderWidth: 1,
      borderColor: colors.borderStrong,
      borderRadius: radius.sm,
      padding: spacing.md,
      backgroundColor: colors.surface,
      color: colors.ink,
      fontFamily: fonts.sans,
      fontSize: type.base,
    },
    button: {
      backgroundColor: colors.solid,
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.lg,
      borderRadius: radius.sm,
    },
    buttonText: { color: colors.solidText, fontFamily: fonts.displaySemi, fontSize: type.sm },
    notice: {
      backgroundColor: colors.pendingBg,
      color: colors.pendingText,
      fontFamily: fonts.sans,
      fontSize: type.sm,
      padding: spacing.md,
      borderRadius: radius.sm,
      marginBottom: spacing.md,
    },
    error: { color: colors.danger, fontFamily: fonts.sans, marginTop: spacing.xs },
    loadMore: {
      borderWidth: 1,
      borderStyle: "dashed",
      borderColor: colors.borderStrong,
      borderRadius: radius.sm,
      paddingVertical: spacing.sm,
      alignItems: "center",
      marginBottom: spacing.md,
    },
    loadMoreText: { color: colors.accent, fontFamily: fonts.displayMedium, fontSize: type.sm },
    empty: { alignItems: "center", paddingVertical: spacing.xl },
    emptyMark: { color: colors.accent, fontSize: 28, marginBottom: spacing.md },
    emptyTitle: {
      fontFamily: fonts.serifBold,
      fontSize: type.md,
      color: colors.ink,
      marginBottom: spacing.xs,
    },
    meta: { color: colors.muted, fontFamily: fonts.sans, fontSize: type.sm },
  });
}
