import { useNavigation, useFocusEffect, type NavigationProp } from "@react-navigation/native";
import type { RouteProp } from "@react-navigation/native";
import { useCallback, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { formatDate, stripMarkdown, type UserProfileResponse } from "@nyps-forum/shared";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth-context";
import { useSettings } from "../lib/settings-context";
import { fonts, radius, spacing, type, type ThemeColors } from "../lib/theme";
import type { RootTabParamList } from "../navigation";
import { Avatar } from "../components/Avatar";
import { Markdown } from "../components/Markdown";
import { ReportButton } from "../components/ReportButton";
import { VerificationBadge } from "../components/VerificationBadge";

/**
 * Registered in all three tab stacks (feed, messages, profile) so any tapped
 * author name pushes a profile without leaving its tab. Cross-tab jumps
 * (opening a thread, starting a DM) go through the parent tab navigator.
 */
interface Props {
  route: RouteProp<{ UserProfile: { userId: string } }, "UserProfile">;
}

const PAGE = 10;

export function UserProfileScreen({ route }: Props) {
  const { userId } = route.params;
  const { user: viewer, token } = useAuth();
  const { colors, dateFormat } = useSettings();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const tabNavigation = useNavigation<NavigationProp<RootTabParamList>>();
  const [profile, setProfile] = useState<UserProfileResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [blocked, setBlocked] = useState(false);
  const [loadingMore, setLoadingMore] = useState<"threads" | "replies" | null>(null);

  useFocusEffect(
    useCallback(() => {
      api
        .get<UserProfileResponse>(`/api/users/${userId}/profile`, token)
        .then(setProfile)
        .catch((e) => setError(e.message));
      api
        .get<{ blocked: boolean }>(`/api/users/${userId}/block`, token)
        .then((res) => setBlocked(res.blocked))
        .catch(() => {});
    }, [userId, token]),
  );

  async function loadMore(section: "threads" | "replies") {
    if (!profile) return;
    setLoadingMore(section);
    try {
      const qs =
        section === "threads"
          ? `threadsLimit=${PAGE}&threadsOffset=${profile.threads.length}`
          : `repliesLimit=${PAGE}&repliesOffset=${profile.replies.length}`;
      const res = await api.get<UserProfileResponse>(`/api/users/${userId}/profile?${qs}`, token);
      setProfile({
        ...profile,
        threads: section === "threads" ? [...profile.threads, ...res.threads] : profile.threads,
        hasMoreThreads: section === "threads" ? res.hasMoreThreads : profile.hasMoreThreads,
        replies: section === "replies" ? [...profile.replies, ...res.replies] : profile.replies,
        hasMoreReplies: section === "replies" ? res.hasMoreReplies : profile.hasMoreReplies,
      });
    } finally {
      setLoadingMore(null);
    }
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

  function openThread(threadId: string) {
    tabNavigation.navigate("FeedTab", { screen: "Thread", params: { threadId } });
  }

  if (error) {
    return (
      <View style={styles.container}>
        <Text style={styles.error}>{error}</Text>
      </View>
    );
  }

  if (!profile) {
    return (
      <View style={styles.container}>
        <View style={styles.headerSkeleton}>
          <View style={styles.skeletonCircle} />
          <View style={{ flex: 1, gap: spacing.md }}>
            <View style={[styles.skeletonBar, { width: "60%" }]} />
            <View style={[styles.skeletonBar, { width: "40%" }]} />
          </View>
        </View>
      </View>
    );
  }

  const { user } = profile;
  const isSelf = viewer?.id === user.id;

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: spacing.lg }}>
      <View style={styles.header}>
        <Avatar name={user.displayName} uri={user.avatarUrl} size={84} />
        <Text style={styles.name}>{user.displayName}</Text>
        <View style={styles.badges}>
          <VerificationBadge status={user.verificationStatus} />
          {user.isSupporter && (
            <View style={styles.supporterBadge}>
              <Text style={styles.supporterText}>SUPPORTER</Text>
            </View>
          )}
        </View>
        <Text style={styles.meta}>
          Member since {formatDate(user.createdAt, dateFormat)} · {profile.threadCount}{" "}
          {profile.threadCount === 1 ? "thread" : "threads"} · {profile.replyCount}{" "}
          {profile.replyCount === 1 ? "reply" : "replies"}
        </Text>
        {user.bio && (
          <View style={styles.bio}>
            <Markdown>{user.bio}</Markdown>
          </View>
        )}

        {!isSelf && viewer && (
          <View style={styles.actions}>
            {!blocked && (
              <Pressable
                style={styles.messageButton}
                onPress={() =>
                  tabNavigation.navigate("MessagesTab", {
                    screen: "Conversation",
                    params: { userId: user.id, displayName: user.displayName },
                  })
                }
              >
                <Text style={styles.messageButtonText}>Message</Text>
              </Pressable>
            )}
            <ReportButton targetType="user" targetId={user.id} />
            <Pressable onPress={toggleBlock}>
              <Text style={styles.linkText}>{blocked ? "Unblock" : "Block"}</Text>
            </Pressable>
          </View>
        )}
      </View>

      {blocked && (
        <Text style={styles.notice}>
          You&apos;ve blocked this member — unblock them to exchange messages again.
        </Text>
      )}

      <Text style={styles.sectionTitle}>Threads</Text>
      {profile.threads.length === 0 && (
        <Text style={styles.meta}>No threads yet.</Text>
      )}
      {profile.threads.map((t) => (
        <Pressable key={t.id} style={styles.card} onPress={() => openThread(t.id)}>
          <Text style={styles.cardTitle}>
            {t.title}
            {t.locked ? " 🔒" : ""}
          </Text>
          <Text style={[styles.meta, { marginTop: spacing.xs }]}>
            {formatDate(t.createdAt, dateFormat)} · ♥ {t.likeCount} · {t.postCount}{" "}
            {t.postCount === 1 ? "reply" : "replies"}
          </Text>
        </Pressable>
      ))}
      {profile.hasMoreThreads && (
        <Pressable
          style={styles.loadMore}
          onPress={() => loadMore("threads")}
          disabled={loadingMore !== null}
        >
          <Text style={styles.loadMoreText}>
            {loadingMore === "threads" ? "Loading..." : "More threads"}
          </Text>
        </Pressable>
      )}

      <Text style={styles.sectionTitle}>Replies</Text>
      {profile.replies.length === 0 && (
        <Text style={[styles.meta, { marginBottom: spacing.lg }]}>No replies yet.</Text>
      )}
      {profile.replies.map((r) => (
        <Pressable key={r.id} style={styles.card} onPress={() => openThread(r.threadId)}>
          <Text style={styles.replyQuote} numberOfLines={3}>
            {stripMarkdown(r.body)}
          </Text>
          <Text style={[styles.meta, { marginTop: spacing.sm }]}>
            in <Text style={styles.replyThreadTitle}>{r.threadTitle}</Text> ·{" "}
            {formatDate(r.createdAt, dateFormat)} · ♥ {r.likeCount}
          </Text>
        </Pressable>
      ))}
      {profile.hasMoreReplies && (
        <Pressable
          style={[styles.loadMore, { marginBottom: spacing.xl }]}
          onPress={() => loadMore("replies")}
          disabled={loadingMore !== null}
        >
          <Text style={styles.loadMoreText}>
            {loadingMore === "replies" ? "Loading..." : "More replies"}
          </Text>
        </Pressable>
      )}
    </ScrollView>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.paper },
    header: { alignItems: "center", paddingVertical: spacing.lg },
    name: {
      fontFamily: fonts.serifBold,
      fontSize: type.lg,
      color: colors.ink,
      marginTop: spacing.md,
      textAlign: "center",
    },
    badges: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md },
    supporterBadge: {
      backgroundColor: colors.supporterBg,
      borderWidth: 1,
      borderColor: colors.supporterBorder,
      borderRadius: radius.full,
      paddingHorizontal: spacing.sm,
      paddingVertical: 3,
    },
    supporterText: {
      color: colors.supporterText,
      fontFamily: fonts.displaySemi,
      fontSize: type.xs,
      letterSpacing: 0.5,
    },
    meta: { color: colors.muted, fontFamily: fonts.sans, fontSize: type.sm, marginTop: spacing.sm },
    bio: {
      color: colors.ink,
      fontFamily: fonts.sans,
      fontSize: type.base,
      lineHeight: 22,
      marginTop: spacing.md,
      textAlign: "center",
      paddingHorizontal: spacing.lg,
    },
    actions: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.lg,
      marginTop: spacing.lg,
    },
    messageButton: {
      backgroundColor: colors.solid,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.xl,
      borderRadius: radius.sm,
    },
    messageButtonText: { color: colors.solidText, fontFamily: fonts.displaySemi, fontSize: type.sm },
    linkText: {
      color: colors.muted,
      fontFamily: fonts.sans,
      fontSize: type.sm,
      textDecorationLine: "underline",
    },
    notice: {
      backgroundColor: colors.pendingBg,
      color: colors.pendingText,
      fontFamily: fonts.sans,
      fontSize: type.sm,
      padding: spacing.md,
      borderRadius: radius.sm,
      marginBottom: spacing.md,
    },
    sectionTitle: {
      fontFamily: fonts.serifBold,
      fontSize: type.md,
      color: colors.ink,
      marginTop: spacing.xl,
      marginBottom: spacing.sm,
    },
    card: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      padding: spacing.lg,
      marginBottom: spacing.sm,
    },
    cardTitle: { fontFamily: fonts.serifBold, fontSize: type.base, lineHeight: 22, color: colors.ink },
    replyQuote: {
      color: colors.inkSoft,
      fontFamily: fonts.sans,
      fontSize: type.sm,
      lineHeight: 20,
      borderLeftWidth: 2,
      borderLeftColor: colors.border,
      paddingLeft: spacing.md,
    },
    replyThreadTitle: { fontFamily: fonts.displaySemi, color: colors.ink },
    loadMore: {
      borderWidth: 1,
      borderStyle: "dashed",
      borderColor: colors.borderStrong,
      borderRadius: radius.sm,
      paddingVertical: spacing.md,
      alignItems: "center",
      marginTop: spacing.xs,
    },
    loadMoreText: { color: colors.accent, fontFamily: fonts.displayMedium, fontSize: type.sm },
    error: { color: colors.danger, fontFamily: fonts.sans, padding: spacing.lg },
    headerSkeleton: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.lg,
      padding: spacing.lg,
    },
    skeletonCircle: { width: 84, height: 84, borderRadius: radius.full, backgroundColor: colors.stone2 },
    skeletonBar: { height: 14, borderRadius: radius.sm, backgroundColor: colors.stone2 },
  });
}
