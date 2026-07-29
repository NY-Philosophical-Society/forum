import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useCallback, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import type { DirectMessage } from "@nyps-forum/shared";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth-context";
import { colors } from "../lib/theme";
import type { RootStackParamList } from "../navigation";

type Props = NativeStackScreenProps<RootStackParamList, "Conversation">;

export function ConversationScreen({ route }: Props) {
  const { userId } = route.params;
  const { user, token } = useAuth();
  const [messages, setMessages] = useState<DirectMessage[] | null>(null);
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const load = useCallback(() => {
    if (!token) return;
    api
      .get<{ messages: DirectMessage[] }>(`/api/messages/${userId}`, token)
      .then((res) => setMessages(res.messages))
      .catch((e) => setError(e.message));
  }, [userId, token]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function send() {
    if (!token || !body.trim()) return;
    setSending(true);
    setError(null);
    try {
      await api.post("/api/messages", { recipientId: userId, body }, token);
      setBody("");
      load();
    } catch (err: any) {
      setError(err.message ?? "Could not send message");
    } finally {
      setSending(false);
    }
  }

  const canSend = user?.verificationStatus === "VERIFIED";

  return (
    <View style={styles.container}>
      <FlatList
        data={messages ?? []}
        keyExtractor={(m) => m.id}
        renderItem={({ item }) => (
          <View
            style={[
              styles.bubble,
              item.senderId === user?.id ? styles.bubbleMine : styles.bubbleTheirs,
            ]}
          >
            <Text style={item.senderId === user?.id ? styles.bubbleTextMine : styles.bubbleTextTheirs}>
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
          />
          <Pressable style={styles.button} onPress={send} disabled={sending}>
            <Text style={styles.buttonText}>{sending ? "..." : "Send"}</Text>
          </Pressable>
        </View>
      ) : (
        <Text style={styles.notice}>
          {user ? "Verify your identity" : "Log in"} to send messages.
        </Text>
      )}
      {error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper, padding: 16 },
  bubble: { maxWidth: "75%", padding: 10, borderRadius: 10, marginBottom: 8 },
  bubbleMine: { backgroundColor: colors.ink, alignSelf: "flex-end" },
  bubbleTheirs: { backgroundColor: "white", borderWidth: 1, borderColor: colors.border, alignSelf: "flex-start" },
  bubbleTextMine: { color: "white" },
  bubbleTextTheirs: { color: colors.ink },
  composeRow: { flexDirection: "row", gap: 8, marginTop: 8, alignItems: "center" },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 6,
    padding: 10,
    backgroundColor: "white",
  },
  button: {
    backgroundColor: colors.ink,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 6,
  },
  buttonText: { color: "white", fontWeight: "700" },
  notice: {
    backgroundColor: colors.pendingBg,
    color: colors.pendingText,
    padding: 10,
    borderRadius: 6,
    marginTop: 8,
  },
  error: { color: colors.danger, marginTop: 4 },
});
