import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import type { TagWithCount } from "@nyps-forum/shared";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth-context";
import { colors } from "../lib/theme";
import type { RootStackParamList } from "../navigation";

type Props = NativeStackScreenProps<RootStackParamList, "NewThread">;

export function NewThreadScreen({ route, navigation }: Props) {
  const { tagId } = route.params;
  const { token } = useAuth();
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
    <View style={styles.container}>
      <Text style={styles.h1}>New Thread</Text>
      <Text style={styles.label}>Title</Text>
      <TextInput style={styles.input} value={title} onChangeText={setTitle} />
      <Text style={styles.label}>Opening post</Text>
      <TextInput style={styles.textarea} multiline value={body} onChangeText={setBody} />
      <Text style={styles.label}>Tags (optional)</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
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
      </ScrollView>
      {error && <Text style={styles.error}>{error}</Text>}
      <Pressable style={styles.button} onPress={onSubmit} disabled={submitting}>
        <Text style={styles.buttonText}>{submitting ? "Posting..." : "Post thread"}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper, padding: 16 },
  h1: { fontSize: 22, fontWeight: "700", color: colors.ink, marginBottom: 12 },
  label: { fontWeight: "700", color: colors.ink, marginTop: 8, marginBottom: 4 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 6,
    padding: 10,
    backgroundColor: "white",
  },
  textarea: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 6,
    padding: 10,
    minHeight: 120,
    backgroundColor: "white",
    textAlignVertical: "top",
  },
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
  error: { color: colors.danger, marginTop: 8 },
  button: {
    backgroundColor: colors.ink,
    paddingVertical: 12,
    borderRadius: 6,
    alignItems: "center",
    marginTop: 16,
  },
  buttonText: { color: "white", fontWeight: "700" },
});
