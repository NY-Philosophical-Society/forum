import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useCallback, useMemo, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import {
  Alert,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import type { DataExport } from "@nyps-forum/shared";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth-context";
import { useSettings } from "../lib/settings-context";
import { hasPasswordIdentity, supabase } from "../lib/supabase";
import { fonts, radius, spacing, type, type ThemeColors } from "../lib/theme";
import type { ProfileStackParamList } from "../navigation";

type Props = NativeStackScreenProps<ProfileStackParamList, "Account">;

/**
 * Account management: password, email, data export, deletion.
 *
 * Credentials are Supabase's now, so the password and email sections talk to
 * supabase-js directly rather than to our API. Whether the account has a
 * password comes off the session's linked identities — an account that only
 * ever signed in with Google has no "email" identity, and is setting a first
 * password rather than changing one.
 */
export function AccountScreen(_props: Props) {
  const { token, logout } = useAuth();
  const { colors } = useSettings();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [email, setEmail] = useState<string | null>(null);
  const [hasPassword, setHasPassword] = useState<boolean | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!token) return;
      supabase.auth.getUser().then(({ data }) => {
        setEmail(data.user?.email ?? null);
        setHasPassword(hasPasswordIdentity(data.user?.identities));
      });
    }, [token]),
  );

  // Change password
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [passwordMsg, setPasswordMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [passwordBusy, setPasswordBusy] = useState(false);

  /**
   * Supabase accepts a password change on session alone. We ask for the current
   * one anyway and verify it by signing in again: a hijacked session should not
   * be enough to lock the real owner out. Signing in also refreshes the token,
   * which is what account deletion below requires.
   */
  async function reauthenticate(password: string): Promise<void> {
    if (!email) throw new Error("Your session has expired — log in again.");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw new Error("That password is incorrect.");
  }

  async function changePassword() {
    setPasswordMsg(null);
    setPasswordBusy(true);
    try {
      if (hasPassword) await reauthenticate(currentPassword);
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw new Error(error.message);
      setCurrentPassword("");
      setNewPassword("");
      setPasswordMsg({ ok: true, text: hasPassword ? "Password changed." : "Password set." });
      setHasPassword(true);
    } catch (err: any) {
      setPasswordMsg({ ok: false, text: err.message ?? "Could not change the password" });
    } finally {
      setPasswordBusy(false);
    }
  }

  // Change email
  const [newEmail, setNewEmail] = useState("");
  const [emailPassword, setEmailPassword] = useState("");
  const [emailMsg, setEmailMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [emailBusy, setEmailBusy] = useState(false);

  async function changeEmail() {
    setEmailMsg(null);
    setEmailBusy(true);
    try {
      if (hasPassword) await reauthenticate(emailPassword);
      const { error } = await supabase.auth.updateUser({ email: newEmail.trim() });
      if (error) throw new Error(error.message);
      setNewEmail("");
      setEmailPassword("");
      // Supabase applies the change only once the new address is confirmed;
      // our API mirrors it from the token on the next request after that.
      setEmailMsg({
        ok: true,
        text: "Check your new email for a confirmation link — the change applies once you tap it.",
      });
    } catch (err: any) {
      setEmailMsg({ ok: false, text: err.message ?? "Could not change the email" });
    } finally {
      setEmailBusy(false);
    }
  }

  // Export
  const [exporting, setExporting] = useState(false);

  async function exportData() {
    if (!token) return;
    setExporting(true);
    try {
      const data = await api.get<DataExport>("/api/users/me/export", token);
      // No filesystem download on a phone — hand the JSON to the share
      // sheet (AirDrop, Files, mail, ...).
      await Share.share({ message: JSON.stringify(data, null, 2) });
    } catch (err: any) {
      Alert.alert("Export failed", err.message ?? "Could not export your data");
    } finally {
      setExporting(false);
    }
  }

  // Delete account
  const [deleteArmed, setDeleteArmed] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteMsg, setDeleteMsg] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  /**
   * The API requires a freshly-minted token here (see routes/users.ts) — the
   * replacement for the password check it used to run itself. Signing in again
   * produces one; accounts that only use Google/Apple have no password to
   * re-enter and get the API's own instruction to sign in again.
   */
  async function deleteAccount() {
    setDeleteMsg(null);
    setDeleting(true);
    try {
      if (hasPassword) await reauthenticate(deletePassword);
      const { data } = await supabase.auth.getSession();
      await api.deleteWithBody(
        "/api/users/me",
        { confirm: confirmText },
        data.session?.access_token,
      );
      await logout();
    } catch (err: any) {
      setDeleteMsg(err.message ?? "Could not delete the account");
      setDeleting(false);
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: spacing.lg }}>
      <View style={styles.section}>
        <Text style={styles.h2}>{hasPassword === false ? "Set a password" : "Change password"}</Text>
        {hasPassword === false && (
          <Text style={styles.meta}>
            Your account signs in with Google or Apple. Setting a password also lets you log in
            with your email address.
          </Text>
        )}
        {hasPassword !== false && (
          <TextInput
            style={styles.input}
            value={currentPassword}
            onChangeText={setCurrentPassword}
            placeholder="Current password"
            placeholderTextColor={colors.muted}
            secureTextEntry
          />
        )}
        <TextInput
          style={styles.input}
          value={newPassword}
          onChangeText={setNewPassword}
          placeholder="New password (at least 8 characters)"
          placeholderTextColor={colors.muted}
          secureTextEntry
        />
        {passwordMsg && (
          <Text style={passwordMsg.ok ? styles.success : styles.error}>{passwordMsg.text}</Text>
        )}
        <Pressable
          style={styles.button}
          onPress={changePassword}
          disabled={passwordBusy || newPassword.length < 8}
        >
          <Text style={styles.buttonText}>
            {passwordBusy ? "Saving..." : hasPassword === false ? "Set password" : "Change password"}
          </Text>
        </Pressable>
      </View>

      <View style={styles.section}>
        <Text style={styles.h2}>Change email</Text>
        {email && (
          <Text style={styles.meta}>
            Current email: <Text style={{ color: colors.ink }}>{email}</Text>
          </Text>
        )}
        <TextInput
          style={styles.input}
          value={newEmail}
          onChangeText={setNewEmail}
          placeholder="New email"
          placeholderTextColor={colors.muted}
          keyboardType="email-address"
          autoCapitalize="none"
        />
        {hasPassword !== false && (
          <TextInput
            style={styles.input}
            value={emailPassword}
            onChangeText={setEmailPassword}
            placeholder="Password"
            placeholderTextColor={colors.muted}
            secureTextEntry
          />
        )}
        {emailMsg && <Text style={emailMsg.ok ? styles.success : styles.error}>{emailMsg.text}</Text>}
        <Pressable style={styles.button} onPress={changeEmail} disabled={emailBusy || !newEmail.trim()}>
          <Text style={styles.buttonText}>{emailBusy ? "Saving..." : "Change email"}</Text>
        </Pressable>
      </View>

      <View style={styles.section}>
        <Text style={styles.h2}>Export my data</Text>
        <Text style={styles.meta}>
          A JSON copy of your account details, threads, replies, and messages.
        </Text>
        <Pressable style={styles.outlineButton} onPress={exportData} disabled={exporting}>
          <Text style={styles.outlineButtonText}>
            {exporting ? "Preparing..." : "Export my data"}
          </Text>
        </Pressable>
      </View>

      <View style={[styles.section, styles.dangerSection, { marginBottom: spacing.xxl }]}>
        <Text style={styles.h2}>Delete account</Text>
        <Text style={styles.meta}>
          Deleting your account is permanent. Your threads and replies stay in place, attributed to
          &ldquo;[deleted]&rdquo;, so other members&apos; discussions aren&apos;t torn up — but your
          name, photo, bio, and sign-in are removed and can&apos;t be restored.
        </Text>
        {!deleteArmed ? (
          <Pressable style={styles.dangerButton} onPress={() => setDeleteArmed(true)}>
            <Text style={styles.dangerButtonText}>Delete my account...</Text>
          </Pressable>
        ) : (
          <>
            <TextInput
              style={styles.input}
              value={confirmText}
              onChangeText={setConfirmText}
              placeholder='Type "DELETE" to confirm'
              placeholderTextColor={colors.muted}
              autoCapitalize="characters"
            />
            {hasPassword !== false && (
              <TextInput
                style={styles.input}
                value={deletePassword}
                onChangeText={setDeletePassword}
                placeholder="Password"
                placeholderTextColor={colors.muted}
                secureTextEntry
              />
            )}
            {deleteMsg && <Text style={styles.error}>{deleteMsg}</Text>}
            <Pressable
              style={styles.dangerButton}
              onPress={deleteAccount}
              disabled={deleting || confirmText !== "DELETE"}
            >
              <Text style={styles.dangerButtonText}>
                {deleting ? "Deleting..." : "Permanently delete"}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => {
                setDeleteArmed(false);
                setConfirmText("");
                setDeletePassword("");
                setDeleteMsg(null);
              }}
            >
              <Text style={styles.linkText}>Cancel</Text>
            </Pressable>
          </>
        )}
      </View>
    </ScrollView>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.paper },
    section: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      padding: spacing.lg,
      marginBottom: spacing.lg,
      gap: spacing.md,
    },
    dangerSection: { borderColor: colors.rejectedBorder },
    h2: { fontFamily: fonts.serifBold, fontSize: type.md, color: colors.ink },
    meta: { color: colors.muted, fontFamily: fonts.sans, fontSize: type.sm, lineHeight: 19 },
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
    button: {
      backgroundColor: colors.solid,
      paddingVertical: spacing.md,
      borderRadius: radius.sm,
      alignItems: "center",
    },
    buttonText: { color: colors.solidText, fontFamily: fonts.displaySemi, fontSize: type.sm },
    outlineButton: {
      borderWidth: 1,
      borderColor: colors.ink,
      borderRadius: radius.sm,
      paddingVertical: spacing.md,
      alignItems: "center",
    },
    outlineButtonText: { color: colors.ink, fontFamily: fonts.displaySemi, fontSize: type.sm },
    dangerButton: {
      borderWidth: 1,
      borderColor: colors.rejectedBorder,
      borderRadius: radius.sm,
      paddingVertical: spacing.md,
      alignItems: "center",
    },
    dangerButtonText: { color: colors.danger, fontFamily: fonts.displaySemi, fontSize: type.sm },
    linkText: {
      color: colors.muted,
      fontFamily: fonts.sans,
      fontSize: type.sm,
      textDecorationLine: "underline",
      textAlign: "center",
    },
    success: {
      backgroundColor: colors.verifiedBg,
      color: colors.verifiedText,
      fontFamily: fonts.sans,
      fontSize: type.sm,
      padding: spacing.md,
      borderRadius: radius.sm,
    },
    error: { color: colors.danger, fontFamily: fonts.sans, fontSize: type.sm },
  });
}
