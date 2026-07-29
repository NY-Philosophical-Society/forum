import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import type { ConversationSummary, PublicUser } from "@nyps-forum/shared";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth-context";
import { useSettings } from "../lib/settings-context";
import { fonts, radius, spacing, type, type ThemeColors } from "../lib/theme";
import type { MessagesStackParamList } from "../navigation";

type Props = NativeStackScreenProps<MessagesStackParamList, "Messages">;

export function MessagesScreen({ navigation }: Props) {
  const { token } = useAuth();
  const { colors } = useSettings();
  const styles = useMemo(() => makeStyles(colors), [colors]);
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
      <TextInput
        style={styles.input}
        value={search}
        onChangeText={setSearch}
        placeholder="Find someone to message"
        placeholderTextColor={colors.muted}
      />

      {results.map((u) => (
        <Pressable
          key={u.id}
          style={styles.row}
          onPress={() =>
            navigation.navigate("Conversation", { userId: u.id, displayName: u.displayName })
          }
        >
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{u.displayName.charAt(0).toUpperCase()}</Text>
          </View>
          <Text style={styles.name}>{u.displayName}</Text>
        </Pressable>
      ))}

      {conversations === null && (
        <View style={{ marginTop: spacing.lg, gap: spacing.md }}>
          <View style={styles.skeletonRow} />
          <View style={styles.skeletonRow} />
        </View>
      )}

      {conversations?.length === 0 && search.trim() === "" && (
        <View style={styles.empty}>
          <Text style={styles.emptyMark}>❦</Text>
          <Text style={styles.emptyTitle}>No conversations yet</Text>
          <Text style={styles.meta}>
            Search for a member above and open the first line of dialogue.
          </Text>
        </View>
      )}

      <FlatList
        data={conversations ?? []}
        keyExtractor={(c) => c.otherUser.id}
        style={{ marginTop: spacing.md }}
        renderItem={({ item }) => (
          <Pressable
            style={styles.row}
            onPress={() =>
              navigation.navigate("Conversation", {
                userId: item.otherUser.id,
                displayName: item.otherUser.displayName,
              })
            }
          >
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {item.otherUser.displayName.charAt(0).toUpperCase()}
              </Text>
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.name}>{item.otherUser.displayName}</Text>
              <Text style={styles.meta} numberOfLines={1}>
                {item.lastMessage.body}
              </Text>
            </View>
            {item.unreadCount > 0 && (
              <View style={styles.unreadBadge}>
                <Text style={styles.unreadText}>{item.unreadCount}</Text>
              </View>
            )}
          </Pressable>
        )}
      />
    </View>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.paper, padding: spacing.lg },
    input: {
      borderWidth: 1,
      borderColor: colors.borderStrong,
      borderRadius: radius.sm,
      padding: spacing.md,
      backgroundColor: colors.surface,
      color: colors.ink,
      fontFamily: fonts.serif,
      fontSize: type.base,
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      padding: spacing.md,
      marginTop: spacing.sm,
    },
    avatar: {
      width: 40,
      height: 40,
      borderRadius: radius.full,
      backgroundColor: colors.solid,
      alignItems: "center",
      justifyContent: "center",
    },
    avatarText: { color: colors.solidText, fontFamily: fonts.displaySemi, fontSize: type.base },
    name: { fontFamily: fonts.serifBold, fontSize: type.base, color: colors.ink },
    meta: { color: colors.muted, fontFamily: fonts.display, fontSize: type.sm },
    unreadBadge: {
      backgroundColor: colors.accent,
      borderRadius: radius.full,
      paddingHorizontal: spacing.sm,
      paddingVertical: 2,
    },
    unreadText: { color: colors.paper, fontFamily: fonts.displaySemi, fontSize: type.xs },
    skeletonRow: { height: 64, borderRadius: radius.md, backgroundColor: colors.stone2 },
    empty: { alignItems: "center", paddingVertical: spacing.xxl, paddingHorizontal: spacing.lg },
    emptyMark: { color: colors.accent, fontSize: 28, marginBottom: spacing.md },
    emptyTitle: {
      fontFamily: fonts.serifBold,
      fontSize: type.lg,
      color: colors.ink,
      marginBottom: spacing.xs,
    },
  });
}
