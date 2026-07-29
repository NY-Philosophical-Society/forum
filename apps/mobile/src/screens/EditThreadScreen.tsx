import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import type { TagWithCount } from "@nyps-forum/shared";
import { MarkdownComposer } from "../components/MarkdownComposer";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth-context";
import { useSettings } from "../lib/settings-context";
import { fonts, radius, spacing, type, type ThemeColors } from "../lib/theme";
import type { FeedStackParamList } from "../navigation";

type Props = NativeStackScreenProps<FeedStackParamList, "EditThread">;

/**
 * Edit your own thread (title, body, tags). Initial values arrive as route
 * params from ThreadScreen; saving PATCHes and pops back, and ThreadScreen's
 * focus effect refetches.
 */
export function EditThreadScreen({ route, navigation }: Props) {
  const { threadId } = route.params;
  const { token } = useAuth();
  const { colors } = useSettings();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [tags, setTags] = useState<TagWithCount[] | null>(null);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>(route.params.tagIds);
  const [title, setTitle] = useState(route.params.title);
  const [body, setBody] = useState(route.params.body);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get<{ tags: TagWithCount[] }>("/api/tags").then((res) => setTags(res.tags));
  }, []);

  function toggleTag(id: string) {
    setSelectedTagIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function onSave() {
    setError(null);
    setSaving(true);
    try {
      await api.patch(`/api/threads/${threadId}`, { title, body, tagIds: selectedTagIds }, token);
      navigation.goBack();
    } catch (err: any) {
      setError(err.message ?? "Could not save changes");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: spacing.lg }}>
      <Text style={styles.label}>Title</Text>
      <TextInput
        style={styles.input}
        value={title}
        onChangeText={setTitle}
        placeholderTextColor={colors.muted}
      />
      <Text style={styles.label}>Text</Text>
      <MarkdownComposer value={body} onChange={setBody} minHeight={140} />
      <Text style={styles.label}>Tags</Text>
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
      <Pressable style={styles.button} onPress={onSave} disabled={saving}>
        <Text style={styles.buttonText}>{saving ? "Saving..." : "Save changes"}</Text>
      </Pressable>
    </ScrollView>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.paper },
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
