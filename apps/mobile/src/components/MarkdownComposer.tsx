import * as ImagePicker from "expo-image-picker";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import { useEffect, useMemo, useState } from "react";
import {
  ActionSheetIOS,
  Alert,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  mentionMarkdown,
  type ImageUploadResponse,
  type PublicUser,
} from "@nyps-forum/shared";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth-context";
import { useSettings } from "../lib/settings-context";
import { fonts, radius, spacing, type, type ThemeColors } from "../lib/theme";
import { Markdown } from "./Markdown";
import { MarkdownHint } from "./MarkdownHint";

/** Server cap is 1600px; downscaling on-device keeps camera shots under the 4MB limit. */
const IMAGE_MAX_EDGE = 1600;

type Wrap = { before: string; after?: string; line?: boolean; placeholder: string };

const ACTIONS: { label: string; wrap: Wrap }[] = [
  { label: "B", wrap: { before: "**", after: "**", placeholder: "bold text" } },
  { label: "i", wrap: { before: "*", after: "*", placeholder: "italic text" } },
  { label: "❝", wrap: { before: "> ", line: true, placeholder: "quoted text" } },
  { label: "•", wrap: { before: "- ", line: true, placeholder: "list item" } },
  { label: "1.", wrap: { before: "1. ", line: true, placeholder: "list item" } },
  { label: "🔗", wrap: { before: "[", after: "](https://)", placeholder: "link text" } },
];

/** The `@name` fragment being typed just before the caret, if any. */
function mentionQueryAt(value: string, caret: number): { start: number; query: string } | null {
  const before = value.slice(0, caret);
  const m = before.match(/(^|\s)@([^\s@]{1,30})$/);
  if (!m) return null;
  return { start: caret - m[2].length - 1, query: m[2] };
}

/**
 * Markdown composer: toolbar, write/preview toggle, image insert, and an
 * @mention autocomplete — the mobile counterpart of the web MarkdownEditor.
 * Keeps raw markdown visible; what you type is what gets stored.
 */
export function MarkdownComposer({
  value,
  onChange,
  placeholder,
  minHeight = 120,
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  minHeight?: number;
}) {
  const { token } = useAuth();
  const { colors } = useSettings();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [preview, setPreview] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [selection, setSelection] = useState({ start: 0, end: 0 });
  const [suggestions, setSuggestions] = useState<PublicUser[]>([]);

  const mention = mentionQueryAt(value, selection.end);

  // Debounced people-search for the @mention menu. The endpoint excludes
  // blocked users in both directions, so the menu can't offer a mention the
  // server would refuse to record.
  useEffect(() => {
    if (!mention || !token) {
      setSuggestions([]);
      return;
    }
    const timer = setTimeout(() => {
      api
        .get<{ users: PublicUser[] }>(
          `/api/users?search=${encodeURIComponent(mention.query)}`,
          token,
        )
        .then((res) => setSuggestions(res.users.slice(0, 4)))
        .catch(() => setSuggestions([]));
    }, 180);
    return () => clearTimeout(timer);
  }, [mention?.query, token]); // eslint-disable-line react-hooks/exhaustive-deps

  function apply(wrap: Wrap) {
    const { start, end } = selection;
    const selected = value.slice(start, end);

    if (wrap.line) {
      const lineStart = value.lastIndexOf("\n", start - 1) + 1;
      const body = selected || wrap.placeholder;
      const insert = body
        .split("\n")
        .map((l) => wrap.before + l)
        .join("\n");
      onChange(value.slice(0, lineStart) + insert + value.slice(end));
      return;
    }

    const text = selected || wrap.placeholder;
    onChange(value.slice(0, start) + wrap.before + text + (wrap.after ?? "") + value.slice(end));
  }

  function insertMention(user: PublicUser) {
    if (!mention) return;
    const inserted = `${mentionMarkdown(user.displayName, user.id)} `;
    onChange(value.slice(0, mention.start) + inserted + value.slice(selection.end));
    setSuggestions([]);
  }

  async function uploadImage(uri: string, width: number) {
    if (!token) return;
    setUploading(true);
    setUploadError(null);
    try {
      // Re-encode to JPEG on-device (downscaling if needed) so HEIC camera
      // shots upload fine and stay under the server's byte cap; the server
      // re-encodes and strips metadata again regardless.
      const context = ImageManipulator.manipulate(uri);
      if (width > IMAGE_MAX_EDGE) context.resize({ width: IMAGE_MAX_EDGE });
      const image = await context.renderAsync();
      const result = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.85 });
      const blob = await (await fetch(result.uri)).blob();
      const res = await api.upload<ImageUploadResponse>("/api/uploads/image", blob, "image/jpeg", token);
      const embed = `![image](${res.url})`;
      const at = selection.end;
      const before = value.slice(0, at);
      const after = value.slice(at);
      const prefix = before === "" || before.endsWith("\n") ? "" : "\n\n";
      const suffix = after.startsWith("\n") || after === "" ? "\n" : "\n\n";
      onChange(before + prefix + embed + suffix + after);
    } catch (err: any) {
      setUploadError(err.message ?? "Could not upload that image");
    } finally {
      setUploading(false);
    }
  }

  async function pickFromLibrary() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setUploadError("Allow photo library access in Settings to add an image.");
      return;
    }
    const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 1 });
    if (!picked.canceled && picked.assets[0]) {
      await uploadImage(picked.assets[0].uri, picked.assets[0].width ?? 0);
    }
  }

  async function takePhoto() {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      setUploadError("Allow camera access in Settings to add an image.");
      return;
    }
    const picked = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 1 });
    if (!picked.canceled && picked.assets[0]) {
      await uploadImage(picked.assets[0].uri, picked.assets[0].width ?? 0);
    }
  }

  function addImage() {
    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: ["Take photo", "Choose from library", "Cancel"], cancelButtonIndex: 2 },
        (index) => {
          if (index === 0) takePhoto();
          else if (index === 1) pickFromLibrary();
        },
      );
    } else {
      Alert.alert("Add image", undefined, [
        { text: "Take photo", onPress: takePhoto },
        { text: "Choose from library", onPress: pickFromLibrary },
        { text: "Cancel", style: "cancel" },
      ]);
    }
  }

  return (
    <View>
      <View style={styles.toolbar}>
        {ACTIONS.map((a) => (
          <Pressable
            key={a.label}
            style={styles.tool}
            disabled={preview}
            onPress={() => apply(a.wrap)}
            accessibilityLabel={`Insert ${a.wrap.placeholder}`}
          >
            <Text style={[styles.toolText, preview && styles.toolTextDisabled]}>{a.label}</Text>
          </Pressable>
        ))}
        <Pressable
          style={styles.tool}
          disabled={preview || uploading}
          onPress={addImage}
          accessibilityLabel="Insert image"
        >
          <Text style={[styles.toolText, (preview || uploading) && styles.toolTextDisabled]}>
            {uploading ? "…" : "🖼"}
          </Text>
        </Pressable>
        <Pressable
          style={[styles.tool, styles.previewToggle, preview && styles.previewToggleActive]}
          onPress={() => setPreview((p) => !p)}
        >
          <Text style={preview ? styles.previewToggleTextActive : styles.previewToggleText}>
            {preview ? "Write" : "Preview"}
          </Text>
        </Pressable>
      </View>

      {preview ? (
        <View style={[styles.previewBox, { minHeight }]}>
          {value.trim() ? (
            <Markdown>{value}</Markdown>
          ) : (
            <Text style={styles.previewEmpty}>Nothing to preview yet.</Text>
          )}
        </View>
      ) : (
        <>
          <TextInput
            style={[styles.textarea, { minHeight }]}
            multiline
            value={value}
            onChangeText={onChange}
            onSelectionChange={(e) => setSelection(e.nativeEvent.selection)}
            placeholder={placeholder}
            placeholderTextColor={colors.muted}
          />
          {mention && suggestions.length > 0 && (
            <View style={styles.mentionMenu}>
              {suggestions.map((u) => (
                <Pressable
                  key={u.id}
                  style={styles.mentionOption}
                  onPress={() => insertMention(u)}
                >
                  <Text style={styles.mentionOptionText}>@{u.displayName}</Text>
                </Pressable>
              ))}
            </View>
          )}
        </>
      )}
      {uploadError && <Text style={styles.error}>{uploadError}</Text>}
      <MarkdownHint />
    </View>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    toolbar: {
      flexDirection: "row",
      flexWrap: "wrap",
      alignItems: "center",
      gap: spacing.xs,
      marginBottom: spacing.xs,
    },
    tool: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.sm,
      minWidth: 34,
      paddingVertical: 5,
      paddingHorizontal: spacing.sm,
      alignItems: "center",
    },
    toolText: { color: colors.ink, fontFamily: fonts.sans, fontSize: type.sm },
    toolTextDisabled: { color: colors.muted },
    previewToggle: { marginLeft: "auto" },
    previewToggleActive: { backgroundColor: colors.solid, borderColor: colors.solid },
    previewToggleText: {
      color: colors.ink,
      fontFamily: fonts.displayMedium,
      fontSize: type.sm,
    },
    previewToggleTextActive: {
      color: colors.solidText,
      fontFamily: fonts.displayMedium,
      fontSize: type.sm,
    },
    previewBox: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.sm,
      padding: spacing.md,
      backgroundColor: colors.surface,
    },
    previewEmpty: { color: colors.muted, fontFamily: fonts.sans, fontSize: type.sm },
    textarea: {
      borderWidth: 1,
      borderColor: colors.borderStrong,
      borderRadius: radius.sm,
      padding: spacing.md,
      backgroundColor: colors.surface,
      color: colors.ink,
      fontFamily: fonts.sans,
      fontSize: type.base,
      lineHeight: 22,
      textAlignVertical: "top",
    },
    mentionMenu: {
      borderWidth: 1,
      borderColor: colors.borderStrong,
      borderRadius: radius.sm,
      backgroundColor: colors.paper,
      marginTop: spacing.xs,
      paddingVertical: spacing.xs,
    },
    mentionOption: { paddingVertical: spacing.sm, paddingHorizontal: spacing.md },
    mentionOptionText: { color: colors.ink, fontFamily: fonts.sans, fontSize: type.sm },
    error: { color: colors.danger, fontFamily: fonts.sans, fontSize: type.sm, marginTop: spacing.xs },
  });
}
