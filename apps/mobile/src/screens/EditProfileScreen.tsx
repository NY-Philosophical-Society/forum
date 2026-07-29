import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import * as ImagePicker from "expo-image-picker";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import { useMemo, useState } from "react";
import {
  ActionSheetIOS,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { BIO_MAX_LENGTH, type PublicUser } from "@nyps-forum/shared";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth-context";
import { useSettings } from "../lib/settings-context";
import { fonts, radius, spacing, type, type ThemeColors } from "../lib/theme";
import type { ProfileStackParamList } from "../navigation";
import { Avatar } from "../components/Avatar";

type Props = NativeStackScreenProps<ProfileStackParamList, "EditProfile">;

/** Client-side resize + JPEG re-encode so multi-megabyte camera shots never leave the phone. */
const UPLOAD_SIZE = 512;

export function EditProfileScreen(_props: Props) {
  const { user, token, refreshUser } = useAuth();
  const { colors } = useSettings();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [bio, setBio] = useState(user?.bio ?? "");
  const [displayName, setDisplayName] = useState(user?.displayName ?? "");
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!user) return null;
  const nameLocked = user.verificationStatus === "VERIFIED";

  async function processAndUpload(uri: string) {
    if (!token) return;
    setError(null);
    setUploading(true);
    try {
      // The picker's square-crop UI has already run; this resizes and
      // re-encodes (which also drops EXIF client-side — the server strips
      // metadata again regardless).
      const context = ImageManipulator.manipulate(uri);
      context.resize({ width: UPLOAD_SIZE });
      const image = await context.renderAsync();
      const result = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.85 });
      const blob = await (await fetch(result.uri)).blob();
      await api.upload<{ user: PublicUser }>("/api/users/me/avatar", blob, "image/jpeg", token);
      await refreshUser();
    } catch (err: any) {
      setError(err.message ?? "Could not upload that photo");
    } finally {
      setUploading(false);
    }
  }

  async function pickFromLibrary() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setError("Allow photo library access in Settings to choose a photo.");
      return;
    }
    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 1,
    });
    if (!picked.canceled && picked.assets[0]) await processAndUpload(picked.assets[0].uri);
  }

  async function takePhoto() {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      setError("Allow camera access in Settings to take a photo.");
      return;
    }
    const picked = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 1,
    });
    if (!picked.canceled && picked.assets[0]) await processAndUpload(picked.assets[0].uri);
  }

  async function removePhoto() {
    if (!token) return;
    setError(null);
    setUploading(true);
    try {
      await api.delete<{ user: PublicUser }>("/api/users/me/avatar", token);
      await refreshUser();
    } catch (err: any) {
      setError(err.message ?? "Could not remove the photo");
    } finally {
      setUploading(false);
    }
  }

  function changePhoto() {
    const hasPhoto = Boolean(user?.avatarUrl);
    if (Platform.OS === "ios") {
      const options = ["Take photo", "Choose from library", ...(hasPhoto ? ["Remove photo"] : []), "Cancel"];
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options,
          cancelButtonIndex: options.length - 1,
          destructiveButtonIndex: hasPhoto ? 2 : undefined,
        },
        (index) => {
          if (index === 0) takePhoto();
          else if (index === 1) pickFromLibrary();
          else if (hasPhoto && index === 2) removePhoto();
        },
      );
    } else {
      Alert.alert("Profile photo", undefined, [
        { text: "Take photo", onPress: takePhoto },
        { text: "Choose from library", onPress: pickFromLibrary },
        ...(hasPhoto ? [{ text: "Remove photo", style: "destructive" as const, onPress: removePhoto }] : []),
        { text: "Cancel", style: "cancel" as const },
      ]);
    }
  }

  async function save() {
    if (!token) return;
    setError(null);
    setSaved(false);
    setSaving(true);
    try {
      await api.patch<{ user: PublicUser }>(
        "/api/users/me",
        nameLocked ? { bio } : { bio, displayName },
        token,
      );
      await refreshUser();
      setSaved(true);
    } catch (err: any) {
      setError(err.message ?? "Could not save your profile");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: spacing.lg }}>
      <View style={styles.photoSection}>
        <Avatar name={user.displayName} uri={user.avatarUrl} size={96} />
        <Pressable style={styles.photoButton} onPress={changePhoto} disabled={uploading}>
          <Text style={styles.photoButtonText}>
            {uploading ? "Working..." : user.avatarUrl ? "Change photo" : "Add photo"}
          </Text>
        </Pressable>
        <Text style={styles.hint}>
          The forum was founded on real names and real faces — members post under both.
        </Text>
      </View>

      <Text style={styles.label}>Display name</Text>
      <TextInput
        style={[styles.input, nameLocked && styles.inputDisabled]}
        value={displayName}
        onChangeText={setDisplayName}
        editable={!nameLocked}
        placeholder="Your real first and last name"
        placeholderTextColor={colors.muted}
      />
      <Text style={styles.hint}>
        {nameLocked
          ? "Your display name is the legal name your identity was verified against, so it can't be changed while verified. Contact the Society if your legal name has changed."
          : "Your real first and last name — it becomes permanent once your identity is verified."}
      </Text>

      <Text style={styles.label}>Bio</Text>
      <TextInput
        style={[styles.input, styles.textarea]}
        value={bio}
        onChangeText={setBio}
        multiline
        maxLength={BIO_MAX_LENGTH}
        placeholder="A line or two about you and what you like to argue about."
        placeholderTextColor={colors.muted}
      />
      <Text style={styles.hint}>
        {bio.length}/{BIO_MAX_LENGTH} characters. Plain text.
      </Text>

      {error && <Text style={styles.error}>{error}</Text>}
      {saved && <Text style={styles.success}>Profile saved.</Text>}

      <Pressable style={styles.saveButton} onPress={save} disabled={saving}>
        <Text style={styles.saveButtonText}>{saving ? "Saving..." : "Save profile"}</Text>
      </Pressable>
    </ScrollView>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.paper },
    photoSection: { alignItems: "center", paddingVertical: spacing.lg, gap: spacing.md },
    photoButton: {
      borderWidth: 1,
      borderColor: colors.ink,
      borderRadius: radius.sm,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.lg,
    },
    photoButtonText: { color: colors.ink, fontFamily: fonts.displaySemi, fontSize: type.sm },
    label: {
      fontFamily: fonts.displaySemi,
      fontSize: type.sm,
      color: colors.ink,
      marginTop: spacing.lg,
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
    inputDisabled: { color: colors.muted, backgroundColor: colors.stone2 },
    textarea: { minHeight: 90, textAlignVertical: "top" },
    hint: {
      color: colors.muted,
      fontFamily: fonts.sans,
      fontSize: type.xs,
      lineHeight: 16,
      marginTop: spacing.xs,
      textAlign: "left",
    },
    error: { color: colors.danger, fontFamily: fonts.sans, fontSize: type.sm, marginTop: spacing.md },
    success: {
      backgroundColor: colors.verifiedBg,
      color: colors.verifiedText,
      fontFamily: fonts.sans,
      fontSize: type.sm,
      padding: spacing.md,
      borderRadius: radius.sm,
      marginTop: spacing.md,
    },
    saveButton: {
      backgroundColor: colors.solid,
      paddingVertical: spacing.md,
      borderRadius: radius.sm,
      alignItems: "center",
      marginTop: spacing.lg,
      marginBottom: spacing.xxl,
    },
    saveButtonText: { color: colors.solidText, fontFamily: fonts.displaySemi, fontSize: type.base },
  });
}
