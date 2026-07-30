import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useNavigation, useFocusEffect, type NavigationProp } from "@react-navigation/native";
import { useCallback, useMemo, useState } from "react";
import { FlatList, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { ChapterSummary } from "@nyps-forum/shared";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth-context";
import { useSettings } from "../lib/settings-context";
import { fonts, radius, spacing, type, type ThemeColors } from "../lib/theme";
import type { FeedStackParamList, RootTabParamList } from "../navigation";

type Props = NativeStackScreenProps<FeedStackParamList, "Chapters">;

/**
 * The chapter directory, nested under the Feed tab. Members see every
 * chapter with their join state; non-members get the membership pitch —
 * a page, not an error (the API refuses them regardless).
 */
export function ChaptersScreen({ navigation }: Props) {
  const { user, token } = useAuth();
  const { colors } = useSettings();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const tabNavigation = useNavigation<NavigationProp<RootTabParamList>>();
  const isMemberViewer = Boolean(user && (user.isSupporter || user.role === "admin"));

  const [chapters, setChapters] = useState<ChapterSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [joiningSlug, setJoiningSlug] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!token || !isMemberViewer) return;
      api
        .get<{ chapters: ChapterSummary[] }>("/api/chapters", token)
        .then((res) => setChapters(res.chapters))
        .catch((e) => setError(e.message));
    }, [token, isMemberViewer]),
  );

  async function requestJoin(chapter: ChapterSummary) {
    if (!token) return;
    setJoiningSlug(chapter.slug);
    try {
      const res = await api.post<{ state: "pending" | "active" }>(
        `/api/chapters/${chapter.slug}/join`,
        {},
        token,
      );
      setChapters(
        (prev) =>
          prev?.map((c) => (c.slug === chapter.slug ? { ...c, myMembership: res.state } : c)) ??
          null,
      );
    } catch (e: any) {
      setError(e.message);
    } finally {
      setJoiningSlug(null);
    }
  }

  if (!isMemberViewer) {
    // The membership pitch — what the rooms are, and where the key lives.
    return (
      <ScrollView style={styles.container} contentContainerStyle={{ padding: spacing.lg }}>
        <Text style={styles.pitchKicker}>MEMBERSHIP</Text>
        <Text style={styles.pitchTitle}>The rooms where members find each other</Text>
        <Text style={styles.pitchDek}>
          The forum is free — reading, writing, arguing, all of it, forever. Membership sustains
          the Society&apos;s events and journal, and opens the spaces built around the people in
          the room.
        </Text>
        {[
          ["Chapters", "Private local sub-forums — the NYC chapter plans its meetups and talks among itself."],
          ["The member directory", "Opt-in and members-only: photo, name, chapter, interests."],
          ["Reading partners", "Flag yourself open to a reading partner, filter for others who did, DM from there."],
          ["Every event's afterthread", "Questions before, recording and transcript after. Reading is open; members carry it on."],
        ].map(([name, desc]) => (
          <View key={name} style={styles.perk}>
            <Text style={styles.perkName}>{name}</Text>
            <Text style={styles.perkDesc}>{desc}</Text>
          </View>
        ))}
        <Pressable
          style={styles.button}
          onPress={() => tabNavigation.navigate("ProfileTab", { screen: "Settings" })}
        >
          <Text style={styles.buttonText}>Redeem a membership code in Settings</Text>
        </Pressable>
        <Text style={styles.meta}>
          Membership never gates reading. The public feed stays open to everyone.
        </Text>
      </ScrollView>
    );
  }

  return (
    <View style={styles.container}>
      {error && <Text style={styles.error}>{error}</Text>}
      <FlatList
        data={chapters ?? []}
        keyExtractor={(c) => c.id}
        contentContainerStyle={{ padding: spacing.lg }}
        ListHeaderComponent={
          <Text style={[styles.meta, { marginBottom: spacing.md }]}>
            Private spaces where a local group talks among itself. Request to join and an admin
            will wave you in.
          </Text>
        }
        ListEmptyComponent={
          chapters ? (
            <View style={styles.empty}>
              <Text style={styles.emptyMark}>❦</Text>
              <Text style={styles.emptyTitle}>No chapters yet</Text>
              <Text style={styles.meta}>When a local group forms, its chapter appears here.</Text>
            </View>
          ) : null
        }
        renderItem={({ item: c }) => (
          <View style={styles.card}>
            <Pressable
              disabled={c.myMembership !== "active"}
              onPress={() => navigation.navigate("Chapter", { slug: c.slug })}
            >
              <Text style={styles.cardTitle}>{c.name}</Text>
            </Pressable>
            <Text style={styles.meta}>
              {c.location ? `${c.location} · ` : ""}
              {c.memberCount} {c.memberCount === 1 ? "member" : "members"}
            </Text>
            {c.description ? <Text style={styles.desc}>{c.description}</Text> : null}
            <View style={styles.cardActions}>
              {c.myMembership === "active" && (
                <Pressable
                  style={styles.button}
                  onPress={() => navigation.navigate("Chapter", { slug: c.slug })}
                >
                  <Text style={styles.buttonText}>Open</Text>
                </Pressable>
              )}
              {c.myMembership === "pending" && (
                <View style={styles.pendingBadge}>
                  <Text style={styles.pendingText}>REQUEST PENDING</Text>
                </View>
              )}
              {c.myMembership === "none" && (
                <Pressable
                  style={styles.outlineButton}
                  disabled={joiningSlug === c.slug}
                  onPress={() => requestJoin(c)}
                >
                  <Text style={styles.outlineButtonText}>
                    {joiningSlug === c.slug ? "Requesting..." : "Request to join"}
                  </Text>
                </Pressable>
              )}
            </View>
          </View>
        )}
      />
    </View>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.paper },
    error: { color: colors.danger, fontFamily: fonts.sans, padding: spacing.lg },
    meta: { color: colors.muted, fontFamily: fonts.sans, fontSize: type.sm },
    card: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      padding: spacing.lg,
      marginBottom: spacing.md,
      gap: spacing.xs,
    },
    cardTitle: { fontFamily: fonts.serifBold, fontSize: type.md, color: colors.ink },
    desc: {
      fontFamily: fonts.sans,
      fontSize: type.base,
      color: colors.ink,
      lineHeight: 22,
      marginTop: spacing.xs,
    },
    cardActions: { flexDirection: "row", marginTop: spacing.md },
    button: {
      backgroundColor: colors.solid,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.lg,
      borderRadius: radius.sm,
      alignSelf: "flex-start",
    },
    buttonText: { color: colors.solidText, fontFamily: fonts.displaySemi, fontSize: type.sm },
    outlineButton: {
      borderWidth: 1,
      borderColor: colors.borderStrong,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.lg,
      borderRadius: radius.sm,
      alignSelf: "flex-start",
    },
    outlineButtonText: { color: colors.ink, fontFamily: fonts.displaySemi, fontSize: type.sm },
    pendingBadge: {
      backgroundColor: colors.pendingBg,
      borderRadius: radius.full,
      paddingVertical: 4,
      paddingHorizontal: spacing.md,
      alignSelf: "flex-start",
    },
    pendingText: {
      color: colors.pendingText,
      fontFamily: fonts.displaySemi,
      fontSize: type.xs,
      letterSpacing: 1,
    },
    empty: { alignItems: "center", paddingVertical: spacing.xxl, paddingHorizontal: spacing.lg },
    emptyMark: { color: colors.accent, fontSize: 28, marginBottom: spacing.md },
    emptyTitle: {
      fontFamily: fonts.serifBold,
      fontSize: type.lg,
      color: colors.ink,
      marginBottom: spacing.xs,
    },
    // Membership pitch
    pitchKicker: {
      color: colors.muted,
      fontFamily: fonts.sans,
      fontSize: type.xs,
      letterSpacing: 2,
      marginBottom: spacing.sm,
    },
    pitchTitle: {
      fontFamily: fonts.serifBold,
      fontSize: type.xl,
      lineHeight: 30,
      color: colors.ink,
      marginBottom: spacing.md,
    },
    pitchDek: {
      fontFamily: fonts.sans,
      fontSize: type.base,
      lineHeight: 23,
      color: colors.ink,
      marginBottom: spacing.lg,
    },
    perk: {
      paddingVertical: spacing.md,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
      gap: spacing.xs,
    },
    perkName: { fontFamily: fonts.serifBold, fontSize: type.base, color: colors.ink },
    perkDesc: { fontFamily: fonts.sans, fontSize: type.sm, color: colors.muted, lineHeight: 19 },
  });
}
