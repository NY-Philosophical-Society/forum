import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import {
  formatDate,
  SEARCH_MIN_QUERY_LENGTH,
  type SearchResponse,
  type SearchResultType,
} from "@nyps-forum/shared";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth-context";
import { useSettings } from "../lib/settings-context";
import { fonts, radius, spacing, type, type ThemeColors } from "../lib/theme";
import type { FeedStackParamList } from "../navigation";
import { Avatar } from "../components/Avatar";

type Props = NativeStackScreenProps<FeedStackParamList, "Search">;

const PAGE_SIZE = 10;
const TABS: { value: SearchResultType; label: string }[] = [
  { value: "all", label: "All" },
  { value: "threads", label: "Threads" },
  { value: "posts", label: "Replies" },
  { value: "users", label: "Members" },
];

/** Bolds every case-insensitive occurrence of the search term. */
function Highlighted({
  text,
  term,
  style,
  markStyle,
  numberOfLines,
}: {
  text: string;
  term: string;
  style: object;
  markStyle: object;
  numberOfLines?: number;
}) {
  const parts: React.ReactNode[] = [];
  const lower = text.toLowerCase();
  const t = term.toLowerCase();
  let i = 0;
  for (;;) {
    const at = t ? lower.indexOf(t, i) : -1;
    if (at === -1) {
      parts.push(text.slice(i));
      break;
    }
    parts.push(text.slice(i, at));
    parts.push(
      <Text key={at} style={markStyle}>
        {text.slice(at, at + term.length)}
      </Text>,
    );
    i = at + term.length;
  }
  return (
    <Text style={style} numberOfLines={numberOfLines}>
      {parts}
    </Text>
  );
}

export function SearchScreen({ navigation }: Props) {
  const { token } = useAuth();
  const { colors, dateFormat } = useSettings();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [input, setInput] = useState("");
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<SearchResultType>("all");
  const [result, setResult] = useState<SearchResponse | null>(null);
  const [searching, setSearching] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (!token || q.length < SEARCH_MIN_QUERY_LENGTH) {
      setResult(null);
      return;
    }
    setSearching(true);
    setError(null);
    api
      .get<SearchResponse>(
        `/api/search?q=${encodeURIComponent(q)}&type=${tab}&limit=${PAGE_SIZE}&offset=0`,
        token,
      )
      .then(setResult)
      .catch((e) => setError(e.message))
      .finally(() => setSearching(false));
  }, [q, tab, token]);

  async function loadMore() {
    if (!token || !result || tab === "all") return;
    setLoadingMore(true);
    try {
      const offset = result[tab].items.length;
      const res = await api.get<SearchResponse>(
        `/api/search?q=${encodeURIComponent(q)}&type=${tab}&limit=${PAGE_SIZE}&offset=${offset}`,
        token,
      );
      setResult({
        ...result,
        [tab]: { ...res[tab], items: [...(result[tab].items as any[]), ...(res[tab].items as any[])] },
      });
    } finally {
      setLoadingMore(false);
    }
  }

  const nothingFound =
    result &&
    result.threads.items.length === 0 &&
    result.posts.items.length === 0 &&
    result.users.items.length === 0;

  const kindLabel = (label: string) => (
    <Text style={styles.kind}>{label.toUpperCase()}</Text>
  );

  return (
    <View style={styles.container}>
      <View style={styles.searchBar}>
        <TextInput
          ref={inputRef}
          style={styles.input}
          value={input}
          onChangeText={setInput}
          onSubmitEditing={() => setQ(input.trim())}
          placeholder="Threads, replies, members..."
          placeholderTextColor={colors.muted}
          returnKeyType="search"
          autoFocus
        />
        <Pressable
          style={styles.searchButton}
          onPress={() => setQ(input.trim())}
          disabled={input.trim().length < SEARCH_MIN_QUERY_LENGTH}
        >
          <Text style={styles.searchButtonText}>Search</Text>
        </Pressable>
      </View>

      <View style={styles.segmented}>
        {TABS.map((t) => (
          <Pressable
            key={t.value}
            style={[styles.segment, tab === t.value && styles.segmentActive]}
            onPress={() => setTab(t.value)}
          >
            <Text style={tab === t.value ? styles.segmentTextActive : styles.segmentText}>
              {t.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {error && <Text style={styles.error}>{error}</Text>}
      {searching && <Text style={styles.meta}>Searching…</Text>}

      {!searching && !result && !error && (
        <View style={styles.empty}>
          <Text style={styles.emptyMark}>❦</Text>
          <Text style={styles.emptyTitle}>Search the forum</Text>
          <Text style={styles.meta}>Find threads, replies, and members by keyword or name.</Text>
        </View>
      )}

      {!searching && nothingFound && (
        <View style={styles.empty}>
          <Text style={styles.emptyMark}>❦</Text>
          <Text style={styles.emptyTitle}>Nothing found for “{q}”</Text>
          <Text style={styles.meta}>Try a shorter word, or a different spelling.</Text>
        </View>
      )}

      {!searching && result && (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: spacing.xl }}>
          {result.threads.items.map((t) => (
            <Pressable
              key={t.id}
              style={styles.hit}
              onPress={() => navigation.navigate("Thread", { threadId: t.id })}
            >
              {kindLabel("Thread")}
              <Highlighted text={t.title} term={q} style={styles.hitTitle} markStyle={styles.mark} />
              <Highlighted
                text={t.snippet}
                term={q}
                style={styles.snippet}
                markStyle={styles.mark}
                numberOfLines={2}
              />
              <Text style={styles.meta}>
                {t.author.displayName} · {formatDate(t.createdAt, dateFormat)} · ♥ {t.likeCount} ·{" "}
                {t.postCount} {t.postCount === 1 ? "reply" : "replies"}
              </Text>
            </Pressable>
          ))}

          {result.posts.items.map((p) => (
            <Pressable
              key={p.id}
              style={styles.hit}
              onPress={() =>
                navigation.navigate("Thread", { threadId: p.threadId, highlightPostId: p.id })
              }
            >
              {kindLabel(`Reply · in “${p.threadTitle}”`)}
              <Highlighted
                text={p.snippet}
                term={q}
                style={styles.snippet}
                markStyle={styles.mark}
                numberOfLines={3}
              />
              <Text style={styles.meta}>
                {p.author.displayName} · {formatDate(p.createdAt, dateFormat)}
              </Text>
            </Pressable>
          ))}

          {result.users.items.map((u) => (
            <Pressable
              key={u.id}
              style={[styles.hit, styles.hitUser]}
              onPress={() => navigation.navigate("UserProfile", { userId: u.id })}
            >
              <Avatar name={u.displayName} uri={u.avatarUrl} size={34} />
              <View style={{ flex: 1 }}>
                <Highlighted
                  text={u.displayName}
                  term={q}
                  style={styles.hitTitle}
                  markStyle={styles.mark}
                />
                <Text style={styles.meta}>Member since {formatDate(u.createdAt, dateFormat)}</Text>
              </View>
            </Pressable>
          ))}

          {tab !== "all" && result[tab].hasMore && (
            <Pressable style={styles.loadMore} onPress={loadMore} disabled={loadingMore}>
              <Text style={styles.loadMoreText}>{loadingMore ? "Loading..." : "Load more"}</Text>
            </Pressable>
          )}
        </ScrollView>
      )}
    </View>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.paper, padding: spacing.lg },
    searchBar: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.md },
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
    searchButton: {
      backgroundColor: colors.solid,
      borderRadius: radius.sm,
      paddingHorizontal: spacing.lg,
      justifyContent: "center",
    },
    searchButtonText: { color: colors.solidText, fontFamily: fonts.displaySemi, fontSize: type.sm },
    segmented: {
      flexDirection: "row",
      backgroundColor: colors.stone2,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.full,
      padding: 3,
      alignSelf: "flex-start",
      marginBottom: spacing.md,
    },
    segment: { paddingVertical: 5, paddingHorizontal: spacing.md, borderRadius: radius.full },
    segmentActive: { backgroundColor: colors.surface },
    segmentText: { color: colors.muted, fontFamily: fonts.displaySemi, fontSize: type.sm },
    segmentTextActive: { color: colors.ink, fontFamily: fonts.displaySemi, fontSize: type.sm },
    error: { color: colors.danger, fontFamily: fonts.sans, marginBottom: spacing.md },
    hit: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      backgroundColor: colors.surface,
      padding: spacing.lg,
      marginBottom: spacing.sm,
      gap: spacing.xs,
    },
    hitUser: { flexDirection: "row", alignItems: "center", gap: spacing.md },
    kind: {
      fontFamily: fonts.displaySemi,
      fontSize: type.xs,
      letterSpacing: 0.5,
      color: colors.muted,
    },
    hitTitle: { fontFamily: fonts.serifBold, fontSize: type.base, color: colors.ink },
    snippet: { fontFamily: fonts.sans, fontSize: type.sm, color: colors.inkSoft, lineHeight: 19 },
    mark: { color: colors.accent, fontFamily: fonts.displaySemi },
    meta: { color: colors.muted, fontFamily: fonts.sans, fontSize: type.xs },
    loadMore: {
      borderWidth: 1,
      borderStyle: "dashed",
      borderColor: colors.borderStrong,
      borderRadius: radius.sm,
      paddingVertical: spacing.md,
      alignItems: "center",
    },
    loadMoreText: { color: colors.accent, fontFamily: fonts.displayMedium, fontSize: type.sm },
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
