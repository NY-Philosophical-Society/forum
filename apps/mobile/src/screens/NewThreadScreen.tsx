import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import type { TagWithCount } from "@nyps-forum/shared";
import { MarkdownHint } from "../components/MarkdownHint";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth-context";
import { useSettings } from "../lib/settings-context";
import { fonts, radius, spacing, type, type ThemeColors } from "../lib/theme";
import type { FeedStackParamList } from "../navigation";

type Props = NativeStackScreenProps<FeedStackParamList, "NewThread">;

export function NewThreadScreen({ route, navigation }: Props) {
  const { tagId } = route.params;
  const { token } = useAuth();
  const { colors } = useSettings();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [tags, setTags] = useState<TagWithCount[] | null>(null);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>(tagId ? [tagId] : []);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api.get<{ tags: TagWithCount[] }>("/api/tags").then((res) => setTags(res.tags));
  }, []);

  function toggleTag(id: string) {
    setSelectedTagIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function onSubmit() {
    setError(null);
    setSubmitting(true);
    try {
      const { thread } = await api.post<{ thread: { id: string } }>(
        "/api/threads",
        { title, body, tagIds: selectedTagIds },
        token,
      );
      navigation.replace("Thread", { threadId: thread.id });
    } catch (err: any) {
      setError(err.message ?? "Could not create thread");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: spacing.lg }}>
      <Text style={styles.meta}>Pose the question well and the discussion will follow.</Text>
      <Text style={styles.label}>Title</Text>
      <TextInput
        style={styles.input}
        value={title}
        onChangeText={setTitle}
        placeholder="Frame it as a question worth arguing about"
        placeholderTextColor={colors.muted}
      />
      <Text style={styles.label}>Opening post</Text>
      <TextInput
        style={styles.textarea}
        multiline
        value={body}
        onChangeText={setBody}
        placeholder="State your position, or lay out the question..."
        placeholderTextColor={colors.muted}
      />
      <MarkdownHint />
      <Text style={styles.label}>Tags (optional)</Text>
      <View style={styles.tagWrap}>
        {tags?.map((t) => (
          <Pressable
            key={t.id}
            style={[styles.chip, selectedTagIds.includes(t.id) && styles.chipActive]}
            onPress={() => toggleTag(t.id)}
          >
            <Text style={selectedTagIds.includes(t.id) ? styles.chipTextActive : styles.chipText}>
              {t.name}
            </Text>
          </Pressable>
        ))}
      </View>
      {error && <Text style={styles.error}>{error}</Text>}
      <Pressable style={styles.button} onPress={onSubmit} disabled={submitting}>
        <Text style={styles.buttonText}>{submitting ? "Posting..." : "Post thread"}</Text>
      </Pressable>
    </ScrollView>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.paper },
    meta: {
      color: colors.muted,
      fontFamily: fonts.sans,
      fontSize: type.sm,
      marginBottom: spacing.md,
    },
    label: {
      fontFamily: fonts.displaySemi,
      fontSize: type.sm,
      color: colors.ink,
      marginTop: spacing.md,
      marginBottom: spacing.xs,
    },
    input: {
      borderWidth: 1,
      borderColor: colors.borderStrong,
      borderRadius: radius.sm,
      padding: spacing.md,
      backgroundColor: colors.surface,
      color: colors.ink,
      fontFamily: fonts.sans,
      fontSize: type.base,
    },
    textarea: {
      borderWidth: 1,
      borderColor: colors.borderStrong,
      borderRadius: radius.sm,
      padding: spacing.md,
      minHeight: 140,
      backgroundColor: colors.surface,
      color: colors.ink,
      fontFamily: fonts.sans,
      fontSize: type.base,
      lineHeight: 22,
      textAlignVertical: "top",
    },
    tagWrap: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
    chip: {
      borderWidth: 1,
      borderColor: colors.borderStrong,
      borderRadius: radius.full,
      paddingVertical: 5,
      paddingHorizontal: spacing.md,
      backgroundColor: "transparent",
    },
    chipActive: { backgroundColor: colors.solid, borderColor: colors.solid },
    chipText: { color: colors.ink, fontFamily: fonts.displayMedium, fontSize: type.sm },
    chipTextActive: { color: colors.solidText, fontFamily: fonts.displayMedium, fontSize: type.sm },
    error: { color: colors.danger, fontFamily: fonts.sans, marginTop: spacing.md },
    button: {
      backgroundColor: colors.solid,
      paddingVertical: spacing.md,
      borderRadius: radius.sm,
      alignItems: "center",
      marginTop: spacing.xl,
    },
    buttonText: { color: colors.solidText, fontFamily: fonts.displaySemi, fontSize: type.base },
  });
}
