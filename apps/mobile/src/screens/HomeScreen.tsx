import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useCallback, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import { FlatList, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { TagWithCount, ThreadSummary } from "@nyps-forum/shared";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth-context";
import { colors } from "../lib/theme";
import type { RootStackParamList } from "../navigation";
import { VerificationBadge } from "../components/VerificationBadge";

type Props = NativeStackScreenProps<RootStackParamList, "Home">;

export function HomeScreen({ navigation }: Props) {
  const { user, token, logout, loading } = useAuth();
  const [sort, setSort] = useState<"hot" | "new">("hot");
  const [activeTag, setActiveTag] = useState<string>("");
  const [tags, setTags] = useState<TagWithCount[] | null>(null);
  const [threads, setThreads] = useState<ThreadSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadThreads = useCallback(() => {
    const qs = new URLSearchParams({ sort });
    if (activeTag) qs.set("tag", activeTag);
    api
      .get<{ threads: ThreadSummary[] }>(`/api/threads?${qs.toString()}`, token)
      .then((res) => setThreads(res.threads))
      .catch((e) => setError(e.message));
  }, [sort, activeTag, token]);

  useFocusEffect(
    useCallback(() => {
      api
        .get<{ tags: TagWithCount[] }>("/api/tags")
        .then((res) => setTags(res.tags))
        .catch((e) => setError(e.message));
      loadThreads();
    }, [loadThreads]),
  );

  async function toggleLike(threadId: string) {
    if (!token) return;
    await api.post(`/api/threads/${threadId}/like`, {}, token);
    loadThreads();
  }

  const canPost = user?.verificationStatus === "VERIFIED";

  return (
    <View style={styles.container}>
      <View style={styles.authRow}>
        {!loading && user ? (
          <>
            <VerificationBadge status={user.verificationStatus} />
            <Text style={styles.name}>{user.displayName}</Text>
            <Pressable onPress={() => navigation.navigate("Verify")}>
              <Text style={styles.link}>Verify</Text>
            </Pressable>
            <Pressable onPress={() => navigation.navigate("Messages")}>
              <Text style={styles.link}>Messages</Text>
            </Pressable>
            <Pressable onPress={logout}>
              <Text style={styles.link}>Log out</Text>
            </Pressable>
          </>
        ) : (
          !loading && (
            <>
              <Pressable onPress={() => navigation.navigate("Login")}>
                <Text style={styles.link}>Log in</Text>
              </Pressable>
              <Pressable onPress={() => navigation.navigate("Signup")}>
                <Text style={styles.link}>Sign up</Text>
              </Pressable>
            </>
          )
        )}
      </View>

      <Text style={styles.h1}>Discussion Feed</Text>

      <View style={styles.tabRow}>
        <Pressable
          style={[styles.tab, sort === "hot" && styles.tabActive]}
          onPress={() => setSort("hot")}
        >
          <Text style={sort === "hot" ? styles.tabTextActive : styles.tabText}>Hot</Text>
        </Pressable>
        <Pressable
          style={[styles.tab, sort === "new" && styles.tabActive]}
          onPress={() => setSort("new")}
        >
          <Text style={sort === "new" ? styles.tabTextActive : styles.tabText}>New</Text>
        </Pressable>
        {canPost && (
          <Pressable
            style={[styles.tab, { marginLeft: "auto" }]}
            onPress={() => navigation.navigate("NewThread", {})}
          >
            <Text style={styles.tabText}>+ New thread</Text>
          </Pressable>
        )}
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
        <Pressable
          style={[styles.chip, activeTag === "" && styles.chipActive]}
          onPress={() => setActiveTag("")}
        >
          <Text style={activeTag === "" ? styles.chipTextActive : styles.chipText}>All</Text>
        </Pressable>
        {tags?.map((t) => (
          <Pressable
            key={t.id}
            style={[styles.chip, activeTag === t.slug && styles.chipActive]}
            onPress={() => setActiveTag(t.slug)}
          >
            <Text style={activeTag === t.slug ? styles.chipTextActive : styles.chipText}>
              {t.name} ({t.threadCount})
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {error && <Text style={styles.error}>{error}</Text>}

      <FlatList
        data={threads ?? []}
        keyExtractor={(t) => t.id}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Pressable onPress={() => navigation.navigate("Thread", { threadId: item.id })}>
              <Text style={styles.cardTitle}>{item.title}</Text>
              <Text style={styles.meta}>
                by {item.author.displayName} · {new Date(item.createdAt).toLocaleDateString()}
              </Text>
            </Pressable>
            {item.tags.length > 0 && (
              <View style={styles.tagRow}>
                {item.tags.map((t) => (
                  <View key={t.id} style={styles.tagPill}>
                    <Text style={styles.tagPillText}>{t.name}</Text>
                  </View>
                ))}
              </View>
            )}
            <View style={styles.likeRow}>
              <Pressable
                style={[styles.likeButton, item.myLiked && styles.likeButtonActive]}
                disabled={!canPost}
                onPress={() => toggleLike(item.id)}
              >
                <Text style={item.myLiked ? styles.likeTextActive : styles.likeText}>
                  ♥ {item.likeCount}
                </Text>
              </Pressable>
              <Text style={styles.meta}>{item.postCount} replies</Text>
            </View>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper, padding: 16 },
  authRow: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 12, flexWrap: "wrap" },
  name: { color: colors.ink, fontWeight: "600" },
  link: { color: colors.accent, fontWeight: "600" },
  h1: { fontSize: 24, fontWeight: "700", color: colors.ink, marginBottom: 8 },
  meta: { color: colors.muted, fontSize: 13, marginTop: 2 },
  error: { color: colors.danger },
  tabRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 },
  tab: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 6 },
  tabActive: { backgroundColor: colors.ink },
  tabText: { color: colors.ink, fontWeight: "600" },
  tabTextActive: { color: "white", fontWeight: "600" },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingVertical: 5,
    paddingHorizontal: 12,
    marginRight: 8,
    backgroundColor: "white",
  },
  chipActive: { backgroundColor: colors.ink, borderColor: colors.ink },
  chipText: { color: colors.ink, fontSize: 13 },
  chipTextActive: { color: "white", fontSize: 13 },
  card: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 14,
    marginTop: 10,
    backgroundColor: "white",
  },
  cardTitle: { fontSize: 16, fontWeight: "700", color: colors.ink },
  tagRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 6 },
  tagPill: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingVertical: 2,
    paddingHorizontal: 8,
  },
  tagPillText: { fontSize: 11, color: colors.ink },
  likeRow: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 8 },
  likeButton: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingVertical: 3,
    paddingHorizontal: 10,
  },
  likeButtonActive: { backgroundColor: "#f6e6e4", borderColor: "#e0a89f" },
  likeText: { color: colors.ink, fontSize: 13 },
  likeTextActive: { color: colors.danger, fontSize: 13, fontWeight: "700" },
});
