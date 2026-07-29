import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useCallback, useEffect, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import type { ConversationSummary, PublicUser } from "@nyps-forum/shared";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth-context";
import { colors } from "../lib/theme";
import type { RootStackParamList } from "../navigation";

type Props = NativeStackScreenProps<RootStackParamList, "Messages">;

export function MessagesScreen({ navigation }: Props) {
  const { token } = useAuth();
  const [conversations, setConversations] = useState<ConversationSummary[] | null>(null);
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<PublicUser[]>([]);

  useFocusEffect(
    useCallback(() => {
      if (!token) return;
      api
        .get<{ conversations: ConversationSummary[] }>("/api/messages/conversations", token)
        .then((res) => setConversations(res.conversations));
    }, [token]),
  );

  useEffect(() => {
    if (!token || !search.trim()) {
      setResults([]);
      return;
    }
    const handle = setTimeout(() => {
      api
        .get<{ users: PublicUser[] }>(`/api/users?search=${encodeURIComponent(search)}`, token)
        .then((res) => setResults(res.users))
        .catch(() => setResults([]));
    }, 250);
    return () => clearTimeout(handle);
  }, [search, token]);

  return (
    <View style={styles.container}>
      <Text style={styles.label}>Find someone to message</Text>
      <TextInput
        style={styles.input}
        value={search}
        onChangeText={setSearch}
        placeholder="Search by name"
      />

      {results.map((u) => (
        <Pressable
          key={u.id}
          style={styles.card}
          onPress={() => navigation.navigate("Conversation", { userId: u.id, displayName: u.displayName })}
        >
          <Text style={styles.cardTitle}>{u.displayName}</Text>
        </Pressable>
      ))}

      <Text style={styles.h2}>Conversations</Text>
      {conversations?.length === 0 && <Text style={styles.meta}>No conversations yet.</Text>}
      <FlatList
        data={conversations ?? []}
        keyExtractor={(c) => c.otherUser.id}
        renderItem={({ item }) => (
          <Pressable
            style={styles.card}
            onPress={() =>
              navigation.navigate("Conversation", {
                userId: item.otherUser.id,
                displayName: item.otherUser.displayName,
              })
            }
          >
            <View style={styles.rowBetween}>
              <View>
                <Text style={styles.cardTitle}>{item.otherUser.displayName}</Text>
                <Text style={styles.meta}>{item.lastMessage.body}</Text>
              </View>
              {item.unreadCount > 0 && (
                <View style={styles.unreadBadge}>
                  <Text style={styles.unreadText}>{item.unreadCount}</Text>
                </View>
              )}
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper, padding: 16 },
  label: { fontWeight: "700", color: colors.ink, marginBottom: 4 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 6,
    padding: 10,
    backgroundColor: "white",
  },
  h2: { fontSize: 16, fontWeight: "700", color: colors.ink, marginTop: 16, marginBottom: 4 },
  meta: { color: colors.muted, fontSize: 13 },
  card: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 12,
    marginTop: 8,
    backgroundColor: "white",
  },
  cardTitle: { fontSize: 15, fontWeight: "700", color: colors.ink },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  unreadBadge: { backgroundColor: colors.danger, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  unreadText: { color: "white", fontSize: 12, fontWeight: "700" },
});
