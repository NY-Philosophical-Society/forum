import { useNavigation } from "@react-navigation/native";
import { useMemo, useState } from "react";
import { Image, Linking, Modal, Pressable, Text, View } from "react-native";
import MarkdownDisplay from "react-native-markdown-display";
import { API_URL } from "../lib/api";
import { useSettings } from "../lib/settings-context";
import { fonts, radius, spacing, type, type ThemeColors } from "../lib/theme";

/** Final pixel size baked into upload URLs by the API (…-800x600.jpg). */
function dimensionsFromUrl(src: string): { width: number; height: number } | null {
  const m = src.match(/-(\d+)x(\d+)\.jpg$/);
  return m ? { width: Number(m[1]), height: Number(m[2]) } : null;
}

/** Only our own uploads render as inline images — see the image rule below. */
function isOwnUpload(src: string): boolean {
  return src.startsWith(`${API_URL}/uploads/`);
}

/**
 * Renders post bodies. The library parses markdown to its own components —
 * it never evaluates HTML — so member text can't inject markup.
 */
export function Markdown({ children }: { children: string }) {
  const { colors } = useSettings();
  const navigation = useNavigation();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [viewer, setViewer] = useState<string | null>(null);

  return (
    <>
      <MarkdownDisplay
        style={styles}
        onLinkPress={(url) => {
          // @mentions are markdown links to /u/<id> — every stack that can
          // show markdown has a UserProfile screen, so navigate in-app.
          // Hyphens included: ids are Supabase auth uuids.
          const mention = url.match(/^\/u\/([A-Za-z0-9-]+)$/);
          if (mention) {
            (navigation as any).navigate("UserProfile", { userId: mention[1] });
            return false;
          }
          if (url.startsWith("/")) return false;
          Linking.openURL(url).catch(() => {});
          return false;
        }}
        rules={{
          // Only images we host render inline: an external URL in a post
          // would let an author log readers' IPs, so it degrades to a link.
          // Our upload URLs carry their pixel size, so the aspect-ratio box
          // is reserved before the bytes arrive — no layout shift.
          image: (node) => {
            const src: string = node.attributes?.src ?? "";
            const alt: string = node.attributes?.alt ?? "";
            if (!isOwnUpload(src)) {
              return (
                <Text
                  key={node.key}
                  style={{ color: colors.accent, textDecorationLine: "underline" }}
                  onPress={() => Linking.openURL(src).catch(() => {})}
                >
                  {alt || src}
                </Text>
              );
            }
            const dims = dimensionsFromUrl(src);
            const aspectRatio = dims ? dims.width / dims.height : 4 / 3;
            return (
              <Pressable
                key={node.key}
                onPress={() => setViewer(src)}
                accessibilityRole="imagebutton"
                accessibilityLabel={alt || "View image"}
              >
                <Image
                  source={{ uri: src }}
                  style={{
                    width: "100%",
                    aspectRatio,
                    borderRadius: radius.sm,
                    borderWidth: 1,
                    borderColor: colors.border,
                    marginVertical: spacing.sm,
                  }}
                  resizeMode="cover"
                />
              </Pressable>
            );
          },
        }}
      >
        {children}
      </MarkdownDisplay>
      <Modal
        visible={viewer !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setViewer(null)}
      >
        <Pressable
          style={{
            flex: 1,
            backgroundColor: "rgba(0, 0, 0, 0.92)",
            justifyContent: "center",
            padding: spacing.lg,
          }}
          onPress={() => setViewer(null)}
        >
          {viewer && (
            <Image source={{ uri: viewer }} style={{ width: "100%", height: "85%" }} resizeMode="contain" />
          )}
          <View style={{ position: "absolute", top: 56, right: spacing.lg }}>
            <Text style={{ color: "#fff", fontSize: type.lg }}>✕</Text>
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

function makeStyles(colors: ThemeColors) {
  const body = {
    fontFamily: fonts.sans,
    fontSize: type.base,
    lineHeight: 24,
    color: colors.ink,
  };

  return {
    body,
    paragraph: { marginTop: 0, marginBottom: spacing.md },
    strong: { fontWeight: "700" as const },
    em: { fontStyle: "italic" as const },
    link: { color: colors.accent, textDecorationLine: "underline" as const },
    // Quoting is the backbone of argument here — give it the accent rule.
    blockquote: {
      backgroundColor: "transparent",
      borderLeftWidth: 3,
      borderLeftColor: colors.accent,
      paddingLeft: spacing.md,
      marginLeft: 0,
      marginVertical: spacing.sm,
    },
    bullet_list: { marginBottom: spacing.md },
    ordered_list: { marginBottom: spacing.md },
    list_item: { marginBottom: spacing.xs },
    heading1: { fontFamily: fonts.serifBold, fontSize: type.lg, color: colors.ink, marginBottom: spacing.sm },
    heading2: { fontFamily: fonts.serifBold, fontSize: type.md, color: colors.ink, marginBottom: spacing.sm },
    heading3: { fontFamily: fonts.serifBold, fontSize: type.base, color: colors.ink, marginBottom: spacing.xs },
    code_inline: {
      backgroundColor: colors.stone2,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 4,
      color: colors.ink,
      fontSize: type.sm,
    },
    fence: {
      backgroundColor: colors.stone2,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.sm,
      color: colors.ink,
      marginBottom: spacing.md,
    },
    code_block: {
      backgroundColor: colors.stone2,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.sm,
      color: colors.ink,
    },
    hr: { backgroundColor: colors.border, height: 1, marginVertical: spacing.lg },
    table: { borderColor: colors.border, borderRadius: radius.sm, marginBottom: spacing.md },
    th: { backgroundColor: colors.stone2, padding: spacing.sm },
    td: { padding: spacing.sm, borderColor: colors.border },
  };
}
