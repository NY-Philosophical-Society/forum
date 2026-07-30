import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useNavigation, useFocusEffect, type NavigationProp } from "@react-navigation/native";
import { useCallback, useMemo, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import type { DirectoryEntry, DirectoryResponse } from "@nyps-forum/shared";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth-context";
import { useSettings } from "../lib/settings-context";
import { fonts, radius, spacing, type, type ThemeColors } from "../lib/theme";
import type { ProfileStackParamList, RootTabParamList } from "../navigation";
import { Avatar } from "../components/Avatar";

type Props = NativeStackScreenProps<ProfileStackParamList, "Directory">;

const PAGE_SIZE = 30;

/**
 * The member directory — opt-in, member-only. Search covers names and
 * interests; the partners toggle is the reading-partner matching feature.
 * Non-members see where the door is instead of an error.
 */
export function DirectoryScreen({ navigation }: Props) {
  const { user, token } = useAuth();
  const { colors } = useSettings();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const tabNavigation = useNavigation<NavigationProp<RootTabParamList>>();
  const isMemberViewer = Boolean(user && (user.isSupporter || user.role === "admin"));

  const [entries, setEntries] = useState<DirectoryEntry[] | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [queryInput, setQueryInput] = useState("");
  const [query, setQuery] = useState("");
  const [partnersOnly, setPartnersOnly] = useState(false);

  const buildPath = useCallback(
    (offset: number) => {
      const qs = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(offset) });
      if (query) qs.set("q", query);
      if (partnersOnly) qs.set("partners", "1");
      return `/api/directory?${qs.toString()}`;
    },
    [query, partnersOnly],
  );

  useFocusEffect(
    useCallback(() => {
      if (!token || !isMemberViewer) return;
      api
        .get<DirectoryResponse>(buildPath(0), token)
        .then((res) => {
          setEntries(res.entries);
          setHasMore(res.hasMore);
        })
        .catch((e) => setError(e.message));
    }, [token, isMemberViewer, buildPath]),
  );

  async function loadMore() {
    if (!token || !entries) return;
    setLoadingMore(true);
    try {
      const res = await api.get<DirectoryResponse>(buildPath(entries.length), token);
      setEntries([...entries, ...res.entries]);
      setHasMore(res.hasMore);
    } finally {
      setLoadingMore(false);
    }
  }

  if (!isMemberViewer) {
    return (
      <View style={[styles.container, { padding: spacing.lg }]}>
        <View style={styles.door}>
          <Text style={styles.doorMark}>❦</Text>
          <Text style={styles.doorTitle}>A member space</Text>
          <Text style={[styles.meta, { textAlign: "center" }]}>
            The directory is where members choose to be findable — photo, name, chapter,
            interests. It opens with membership; reading the forum stays free.
          </Text>
          <Pressable
            style={styles.button}
            onPress={() => navigation.navigate("Settings")}
          >
            <Text style={styles.buttonText}>Redeem a membership code in Settings</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { padding: spacing.lg, paddingBottom: 0 }]}>
      <View style={styles.searchRow}>
        <TextInput
          style={styles.input}
          value={queryInput}
          onChangeText={setQueryInput}
          placeholder="Search by name or interest..."
          placeholderTextColor={colors.muted}
          returnKeyType="search"
          onSubmitEditing={() => setQuery(queryInput.trim())}
        />
        <Pressable
          style={[styles.chip, partnersOnly && styles.chipActive]}
          onPress={() => setPartnersOnly((v) => !v)}
        >
          <Text style={partnersOnly ? styles.chipTextActive : styles.chipText}>⇄ Partners</Text>
        </Pressable>
      </View>

      {error && <Text style={styles.error}>{error}</Text>}

      <FlatList
        data={entries ?? []}
        keyExtractor={(e) => e.user.id}
        ListEmptyComponent={
          entries ? (
            <View style={styles.door}>
              <Text style={styles.doorMark}>❦</Text>
              <Text style={styles.doorTitle}>
                {partnersOnly ? "No one is flying the partner flag yet" : "No members match"}
              </Text>
              <Text style={[styles.meta, { textAlign: "center" }]}>
                {partnersOnly
                  ? "Be the first — switch it on in Settings and someone will find you."
                  : "Members appear here once they opt in from Settings."}
              </Text>
            </View>
          ) : null
        }
        renderItem={({ item: entry }) => (
          <View style={styles.card}>
            <Pressable
              style={styles.cardMain}
              onPress={() => navigation.navigate("UserProfile", { userId: entry.user.id })}
            >
              <Avatar name={entry.user.displayName} uri={entry.user.avatarUrl} size={44} />
              <View style={{ flex: 1 }}>
                <View style={styles.nameRow}>
                  <Text style={styles.name}>{entry.user.displayName}</Text>
                  {entry.openToPartners && (
                    <View style={styles.partnerBadge}>
                      <Text style={styles.partnerText}>⇄ PARTNERS</Text>
                    </View>
                  )}
                </View>
                {entry.chapters.length > 0 && (
                  <Text style={styles.meta}>{entry.chapters.map((c) => c.name).join(" · ")}</Text>
                )}
                {entry.directoryBio && <Text style={styles.bio}>{entry.directoryBio}</Text>}
              </View>
            </Pressable>
            {user && entry.user.id !== user.id && (
              <Pressable
                style={styles.messageButton}
                onPress={() =>
                  tabNavigation.navigate("MessagesTab", {
                    screen: "Conversation",
                    params: { userId: entry.user.id, displayName: entry.user.displayName },
                  })
                }
              >
                <Text style={styles.messageButtonText}>Message</Text>
              </Pressable>
            )}
          </View>
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
    container: { flex: 1, backgroundColor: colors.paper },
    error: { color: colors.danger, fontFamily: fonts.sans, marginBottom: spacing.md },
    meta: { color: colors.muted, fontFamily: fonts.sans, fontSize: type.sm },
    searchRow: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.md },
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
    chip: {
      borderWidth: 1,
      borderColor: colors.borderStrong,
      borderRadius: radius.full,
      paddingHorizontal: spacing.md,
      justifyContent: "center",
    },
    chipActive: { backgroundColor: colors.solid, borderColor: colors.solid },
    chipText: { color: colors.ink, fontFamily: fonts.displayMedium, fontSize: type.sm },
    chipTextActive: { color: colors.solidText, fontFamily: fonts.displayMedium, fontSize: type.sm },
    card: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      padding: spacing.lg,
      marginBottom: spacing.md,
      gap: spacing.md,
    },
    cardMain: { flexDirection: "row", gap: spacing.md, alignItems: "flex-start" },
    nameRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, flexWrap: "wrap" },
    name: { fontFamily: fonts.serifBold, fontSize: type.base, color: colors.ink },
    bio: {
      fontFamily: fonts.sans,
      fontSize: type.sm,
      color: colors.ink,
      lineHeight: 19,
      marginTop: spacing.xs,
    },
    partnerBadge: {
      backgroundColor: colors.supporterBg,
      borderWidth: 1,
      borderColor: colors.supporterBorder,
      borderRadius: radius.full,
      paddingHorizontal: spacing.sm,
      paddingVertical: 2,
    },
    partnerText: {
      color: colors.supporterText,
      fontFamily: fonts.displaySemi,
      fontSize: type.xs,
      letterSpacing: 0.5,
    },
    messageButton: {
      borderWidth: 1,
      borderColor: colors.borderStrong,
      borderRadius: radius.sm,
      paddingVertical: spacing.xs,
      paddingHorizontal: spacing.md,
      alignSelf: "flex-start",
    },
    messageButtonText: { color: colors.ink, fontFamily: fonts.displayMedium, fontSize: type.sm },
    door: { alignItems: "center", paddingVertical: spacing.xxl, gap: spacing.md },
    doorMark: { color: colors.accent, fontSize: 28 },
    doorTitle: { fontFamily: fonts.serifBold, fontSize: type.lg, color: colors.ink },
    button: {
      backgroundColor: colors.solid,
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.lg,
      borderRadius: radius.sm,
    },
    buttonText: { color: colors.solidText, fontFamily: fonts.displaySemi, fontSize: type.sm },
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
  });
}
