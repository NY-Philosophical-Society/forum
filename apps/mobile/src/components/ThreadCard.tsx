import { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { formatDate, type ThreadSummary } from "@nyps-forum/shared";
import { useAuth } from "../lib/auth-context";
import { useSettings } from "../lib/settings-context";
import { fonts, radius, spacing, type, type ThemeColors } from "../lib/theme";
import { Avatar } from "./Avatar";

/**
 * One thread in a feed — used by the main feed and chapter feeds alike so a
 * chapter reads as the same product, not a bolt-on. Handlers come from the
 * parent, which owns its own list state.
 */
export function ThreadCard({
  thread: item,
  onPress,
  onAuthorPress,
  onLike,
  onBookmark,
}: {
  thread: ThreadSummary;
  onPress: () => void;
  onAuthorPress: () => void;
  onLike: () => void;
  onBookmark: () => void;
}) {
  const { user } = useAuth();
  const { colors, dateFormat } = useSettings();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const canLike = Boolean(user?.canWrite);

  return (
    <View style={[styles.card, item.pinnedAt ? styles.cardPinned : null]}>
      {item.pinnedAt ? <Text style={styles.pinnedLabel}>❖ PINNED</Text> : null}
      {item.kind === "event" ? (
        <Text style={styles.eventLabel}>
          ◆ EVENT{item.eventDate ? ` · ${formatDate(item.eventDate, dateFormat)}` : ""}
        </Text>
      ) : null}
      <Pressable onPress={onPress}>
        <Text style={styles.cardTitle}>
          {item.title}
          {item.locked ? " 🔒" : ""}
        </Text>
      </Pressable>
      <View style={styles.byline}>
        <Pressable style={[styles.byline, { marginTop: 0 }]} onPress={onAuthorPress}>
          <Avatar name={item.author.displayName} uri={item.author.avatarUrl} size={22} />
          <Text style={styles.meta}>{item.author.displayName}</Text>
        </Pressable>
        <Text style={styles.meta}>· {formatDate(item.createdAt, dateFormat)}</Text>
      </View>
      {item.tags.length > 0 && (
        <View style={styles.tagRow}>
          {item.tags.map((t) => (
            <View key={t.id} style={styles.tagPill}>
              <Text style={styles.tagPillText}>{t.name.toUpperCase()}</Text>
            </View>
          ))}
        </View>
      )}
      <View style={styles.likeRow}>
        <Pressable
          style={[styles.likeButton, item.myLiked && styles.likeButtonActive]}
          disabled={!canLike}
          onPress={onLike}
        >
          <Text style={item.myLiked ? styles.likeTextActive : styles.likeText}>
            ♥ {item.likeCount}
          </Text>
        </Pressable>
        <Text style={styles.meta}>
          {item.postCount} {item.postCount === 1 ? "reply" : "replies"}
        </Text>
        <Pressable style={{ marginLeft: "auto" }} onPress={onBookmark}>
          <Text style={item.myBookmarked ? styles.saveTextActive : styles.saveText}>
            {item.myBookmarked ? "❧ Saved" : "❧ Save"}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    card: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      padding: spacing.lg,
      marginBottom: spacing.md,
    },
    // An admin pin: a terracotta kicker and a warmer border, never a fill.
    cardPinned: { borderColor: colors.supporterBorder },
    pinnedLabel: {
      color: colors.accent,
      fontFamily: fonts.displaySemi,
      fontSize: type.xs,
      letterSpacing: 1,
      marginBottom: spacing.xs,
    },
    eventLabel: {
      color: colors.accent,
      fontFamily: fonts.displaySemi,
      fontSize: type.xs,
      letterSpacing: 1,
      marginBottom: spacing.xs,
    },
    cardTitle: {
      fontFamily: fonts.serifBold,
      fontSize: type.md,
      lineHeight: 24,
      color: colors.ink,
    },
    byline: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.sm },
    meta: { color: colors.muted, fontFamily: fonts.sans, fontSize: type.sm },
    tagRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs, marginTop: spacing.md },
    tagPill: {
      backgroundColor: colors.stone2,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.full,
      paddingVertical: 2,
      paddingHorizontal: spacing.sm,
    },
    tagPillText: {
      fontFamily: fonts.displaySemi,
      fontSize: type.xs,
      color: colors.inkSoft,
      letterSpacing: 0.5,
    },
    likeRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginTop: spacing.md },
    likeButton: {
      borderWidth: 1,
      borderColor: colors.borderStrong,
      borderRadius: radius.full,
      paddingVertical: 3,
      paddingHorizontal: spacing.md,
    },
    likeButtonActive: { backgroundColor: colors.accentBg, borderColor: colors.supporterBorder },
    likeText: { color: colors.muted, fontFamily: fonts.displayMedium, fontSize: type.sm },
    likeTextActive: { color: colors.accent, fontFamily: fonts.displaySemi, fontSize: type.sm },
    saveText: { color: colors.muted, fontFamily: fonts.displayMedium, fontSize: type.sm },
    saveTextActive: { color: colors.accent, fontFamily: fonts.displaySemi, fontSize: type.sm },
  });
}
