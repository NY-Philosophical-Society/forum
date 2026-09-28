"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useAuth } from "~/lib/auth-context";
import { authenticatedAccountKey } from "~/lib/auth-state";
import { byId, conversations, type ChatLine, type ForumComment, type Person, VIEWER_ID } from "./data";
import { clearRetiredShowcaseData } from "./mock-storage";
import { SHOWCASE_REVIEW_MODE } from "./review-mode";

// The remaining prototype-only activity is session memory, not a second
// database. Only the demo member uses it as an intentional simulation; real
// forum identity and migrated actions come from Supabase and the forum API.
// Exact legacy keys are removed once to prevent stale mock activity from being
// mistaken for account data. No other origin storage is touched.

export type Account = {
  name: string;
  email: string;
  role: string;
  bio: string;
  location: string;
  chapter: string;
  interests: string[];
};

export type NotificationPrefs = {
  replies: boolean;
  mentions: boolean;
  messages: boolean;
  events: boolean;
  weeklyDigest: boolean;
};

export type Settings = {
  directoryVisible: boolean;
  openToConnect: boolean;
  showAttendance: boolean;
  notifications: NotificationPrefs;
};

export type NoticeTarget =
  | { view: "thread"; id: string }
  | { view: "event"; id: string }
  | { view: "profile"; id: string }
  | { view: "messages"; id: string };

export type Notice = {
  id: string;
  kind: "reply" | "mention" | "message" | "event" | "follow";
  actor: string;
  text: string;
  time: string;
  read: boolean;
  target: NoticeTarget;
};

export type UserThread = {
  id: string;
  chapter: string;
  location: string | null;
  topic: string;
  title: string;
  excerpt: string;
  body: string[];
  author: string;
  age: string;
  replies: number;
  likes: number;
  comments: ForumComment[];
};

export type Conversation = {
  id: string;
  kind: string;
  title: string;
  subtitle: string;
  preview: string;
  time: string;
  unread: number;
  members: string[];
  history: ChatLine[];
};

// Everything a single member has done or chosen.
type Activity = {
  settings: Settings;
  follows: string[];
  rsvps: string[];
  // Which location a member picked for each event, keyed by event id. Registration
  // itself completes on Luma; this is what the platform remembers about the choice.
  rsvpLocations: Record<string, string>;
  joinedChapters: string[];
  notices: Notice[];
  userThreads: UserThread[];
  threadReplies: Record<string, ForumComment[]>;
  likedThreads: string[];
  dms: Record<string, ChatLine[]>;
  startedConversations: Conversation[];
  readConversations: string[];
};

type State = {
  currentEmail: string | null;
  accounts: Record<string, Account>;
  activity: Record<string, Activity>;
};

export type AuthResult = { ok: true; confirmationRequired?: boolean } | { ok: false; error: string };

export const DEMO_EMAIL = "member@nyphilosophy.demo";

export const DEMO_ACCOUNT: Account = {
  name: "Philosophy Member",
  email: DEMO_EMAIL,
  role: "Philosopher",
  bio: "Interested in human consciousness and our connection to the universe.",
  location: "Manhattan, New York",
  chapter: "New York",
  interests: ["Consciousness", "Metaphysics", "Philosophy of mind"],
};

const DEFAULT_SETTINGS: Settings = {
  directoryVisible: true,
  openToConnect: true,
  showAttendance: true,
  notifications: { replies: true, mentions: true, messages: true, events: true, weeklyDigest: false },
};

// The demo member has been coming for a few months, so every part of the platform
// has something in it to try: an inbox, people they follow, a chapter.
function demoActivity(): Activity {
  return {
    settings: DEFAULT_SETTINGS,
    follows: ["amara", "priya"],
    rsvps: [],
    rsvpLocations: {},
    joinedChapters: ["New York"],
    notices: [
      { id: "n1", kind: "reply", actor: "maya", text: "replied to your comment on “How much of a good life depends on moral luck?”", time: "12m", read: false, target: { view: "thread", id: "moral-luck" } },
      { id: "n2", kind: "message", actor: "priya", text: "sent you a message about the understanding paper", time: "1h", read: false, target: { view: "messages", id: "priya" } },
      { id: "n3", kind: "event", actor: "amara", text: "Registration for Philosophy Club at McCarren Parkhouse opens tomorrow at noon", time: "3h", read: false, target: { view: "event", id: "utopia" } },
      { id: "n4", kind: "follow", actor: "julian", text: "started following you", time: "Yesterday", read: true, target: { view: "profile", id: "julian" } },
      { id: "n5", kind: "mention", actor: "samuel", text: "mentioned you in “Does beauty ask something of our attention?”", time: "2d", read: true, target: { view: "thread", id: "beauty-attention" } },
    ],
    userThreads: [],
    threadReplies: {},
    likedThreads: [],
    dms: {},
    startedConversations: [],
    readConversations: [],
  };
}

// A real account starts without invented chapter access, notifications, or
// directory consent. Those states belong to the API, never to onboarding copy.
function newMemberActivity(): Activity {
  return {
    settings: { ...DEFAULT_SETTINGS, directoryVisible: false, openToConnect: false },
    follows: [],
    rsvps: [],
    rsvpLocations: {},
    joinedChapters: [],
    notices: [],
    userThreads: [],
    threadReplies: {},
    likedThreads: [],
    dms: {},
    startedConversations: [],
    readConversations: [],
  };
}

const EMPTY_STATE: State = { currentEmail: null, accounts: {}, activity: {} };

// Accounts saved before a field existed are filled in rather than discarded. Posts
// written before discussions had a chapter belong to the author's home chapter.
function withDefaults(activity: Activity, homeChapter: string): Activity {
  return {
    ...activity,
    rsvpLocations: activity.rsvpLocations ?? {},
    userThreads: activity.userThreads.map((thread) => ({ ...thread, chapter: thread.chapter ?? homeChapter, location: thread.location ?? null })),
  };
}

function normalise(email: string) {
  return email.trim().toLowerCase();
}

function initialsFor(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return ((parts[0][0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

type Store = Activity & {
  hydrated: boolean;
  signedIn: boolean;
  account: Account | null;
  viewer: Person;
  person: (id: string) => Person;
  unreadCount: number;
  authError: "session-rejected" | "account-unavailable" | null;
  retryAuth: () => Promise<void>;

  signUp: (input: { name: string; email: string; password: string }) => Promise<AuthResult>;
  signIn: (email: string, password: string) => Promise<AuthResult>;
  signInWithGoogle: () => Promise<AuthResult>;
  continueAsDemo: () => void;
  signOut: () => Promise<void>;
  updateAccount: (patch: Partial<Account>) => void;
  updateSettings: (patch: Partial<Settings>) => void;
  updateNotificationPrefs: (patch: Partial<NotificationPrefs>) => void;
  resetAccount: () => void;

  toggleFollow: (id: string) => boolean;
  chooseLocation: (eventId: string, venue: string) => void;
  cancelRegistration: (eventId: string) => void;
  toggleChapter: (name: string) => boolean;
  markNoticeRead: (id: string) => void;
  markAllNoticesRead: () => void;

  startThread: (input: { topic: string; title: string; body: string; chapter: string; location: string | null }) => string;
  replyToThread: (threadId: string, body: string) => void;
  toggleThreadLike: (threadId: string) => void;

  sendMessage: (conversationId: string, body: string) => void;
  openConversationWith: (personId: string) => string;
  markConversationRead: (id: string) => void;
  allConversations: Conversation[];
};

const ShowcaseContext = createContext<Store | null>(null);

export function ShowcaseProvider({ children }: { children: React.ReactNode }) {
  const auth = useAuth();
  const [state, setState] = useState<State>(EMPTY_STATE);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      clearRetiredShowcaseData(window.localStorage);
    } catch {
      // Private browsing can refuse storage; the in-memory demo still works.
    }
    setHydrated(true);
  }, []);

  // Identity comes from the same Supabase session as the production app.
  // This bridge lets us replace individual sample-data views with real API
  // calls without inventing a second account system.
  useEffect(() => {
    if (SHOWCASE_REVIEW_MODE) return;
    if (!hydrated || auth.loading) return;

    if (!auth.sessionUserId || !auth.email) {
      setState((current) => (
        current.currentEmail && current.currentEmail !== DEMO_EMAIL
          ? { ...current, currentEmail: null }
          : current
      ));
      return;
    }

    // Keep the authenticated account unavailable until /api/auth/me confirms
    // it. A valid Supabase session alone does not grant forum access.
    if (!auth.user) return;

    const key = authenticatedAccountKey(auth.sessionUserId);
    setState((current) => {
      const existing = current.accounts[key];
      const nextAccount: Account = existing
        ? { ...existing, name: auth.user!.displayName || existing.name, bio: auth.user!.bio ?? existing.bio }
        : {
            name: auth.user!.displayName,
            email: key,
            role: auth.user!.role === "admin" ? "Organizer" : "Member",
            bio: auth.user!.bio ?? "",
            location: "",
            chapter: "",
            interests: [],
          };

      if (current.currentEmail === key && current.accounts[key] && existing.name === nextAccount.name && existing.bio === nextAccount.bio) {
        return current;
      }

      const accounts = { ...current.accounts, [key]: nextAccount };
      const activity = {
        ...current.activity,
        [key]: current.activity[key] ?? newMemberActivity(),
      };

      return {
        currentEmail: key,
        accounts,
        activity,
      };
    });
  }, [auth.email, auth.loading, auth.sessionUserId, auth.user, hydrated]);

  const account = state.currentEmail ? state.accounts[state.currentEmail] ?? null : null;
  const stored = state.currentEmail ? state.activity[state.currentEmail] : undefined;
  const activity: Activity = stored
    ? withDefaults(stored, account?.chapter ?? DEMO_ACCOUNT.chapter)
    : state.currentEmail === DEMO_EMAIL ? demoActivity() : newMemberActivity();

  // Every activity update is scoped to whoever is signed in.
  const updateActivity = useCallback((update: (current: Activity) => Activity) => {
    setState((current) => {
      const email = current.currentEmail;
      if (!email) return current;
      const saved = current.activity[email];
      const existing = saved ? withDefaults(saved, current.accounts[email]?.chapter ?? DEMO_ACCOUNT.chapter) : email === DEMO_EMAIL ? demoActivity() : newMemberActivity();
      return { ...current, activity: { ...current.activity, [email]: update(existing) } };
    });
  }, []);

  const viewer = useMemo<Person>(() => {
    const base = byId(VIEWER_ID);
    const profile = account ?? DEMO_ACCOUNT;
    return {
      ...base,
      name: profile.name,
      initials: initialsFor(profile.name),
      role: profile.role,
      bio: profile.bio,
      location: profile.location,
      chapter: profile.chapter,
      interests: profile.interests,
      openToConnect: activity.settings.openToConnect,
    };
  }, [account, activity.settings.openToConnect]);

  const person = useCallback((id: string) => (id === VIEWER_ID ? viewer : byId(id)), [viewer]);

  const signUp: Store["signUp"] = async ({ name, email, password }) => {
    if (SHOWCASE_REVIEW_MODE) return { ok: false, error: "Account creation is unavailable in this review preview." };
    const key = normalise(email);
    if (key === DEMO_EMAIL) return { ok: false, error: "That address is reserved for the demo member. Use your own email." };
    try {
      const signup = await auth.signup(key, password, name.trim());
      return { ok: true, confirmationRequired: signup.confirmationRequired };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Unable to create the account." };
    }
  };

  const signIn: Store["signIn"] = async (email, password) => {
    if (SHOWCASE_REVIEW_MODE) return { ok: false, error: "Sign-in is unavailable in this review preview." };
    const key = normalise(email);
    try {
      await auth.login(key, password);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Unable to log in." };
    }
  };

  const signInWithGoogle: Store["signInWithGoogle"] = async () => {
    if (SHOWCASE_REVIEW_MODE) return { ok: false, error: "Sign-in is unavailable in this review preview." };
    try {
      await auth.loginWithOAuth("google", "/showcase");
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Unable to start Google sign-in." };
    }
  };

  const continueAsDemo = () =>
    setState((current) => ({
      currentEmail: DEMO_EMAIL,
      accounts: { ...current.accounts, [DEMO_EMAIL]: current.accounts[DEMO_EMAIL] ?? DEMO_ACCOUNT },
      activity: { ...current.activity, [DEMO_EMAIL]: current.activity[DEMO_EMAIL] ?? demoActivity() },
    }));

  const signOut = async () => {
    if (!SHOWCASE_REVIEW_MODE && auth.sessionUserId) await auth.logout();
    setState((current) => ({ ...current, currentEmail: null }));
  };

  const updateAccount: Store["updateAccount"] = (patch) =>
    setState((current) => {
      const key = current.currentEmail;
      if (!key || !current.accounts[key]) return current;
      const existing = current.accounts[key];
      return { ...current, accounts: { ...current.accounts, [key]: { ...existing, ...patch, email: existing.email } } };
    });

  const updateSettings: Store["updateSettings"] = (patch) =>
    updateActivity((current) => ({ ...current, settings: { ...current.settings, ...patch } }));

  const updateNotificationPrefs: Store["updateNotificationPrefs"] = (patch) =>
    updateActivity((current) => ({ ...current, settings: { ...current.settings, notifications: { ...current.settings.notifications, ...patch } } }));

  // Reset only browser-local showcase activity. Forum identity and durable API
  // data are separate and are never deleted by this preview control.
  const resetAccount = () =>
    setState((current) => {
      const key = current.currentEmail;
      if (!key) return current;
      const account = current.accounts[key];
      if (!account) return current;
      return {
        ...current,
        accounts: { ...current.accounts, [key]: key === DEMO_EMAIL ? DEMO_ACCOUNT : account },
        activity: { ...current.activity, [key]: key === DEMO_EMAIL ? demoActivity() : newMemberActivity() },
      };
    });

  // State updaters run after this function returns, so the result is derived from
  // the current render's state rather than from inside the updater.
  const toggleFollow: Store["toggleFollow"] = (id) => {
    const nowFollowing = !activity.follows.includes(id);
    updateActivity((current) => ({
      ...current,
      follows: current.follows.includes(id) ? current.follows.filter((entry) => entry !== id) : [...current.follows, id],
    }));
    return nowFollowing;
  };

  const chooseLocation: Store["chooseLocation"] = (eventId, venue) =>
    updateActivity((current) => ({
      ...current,
      rsvps: current.rsvps.includes(eventId) ? current.rsvps : [...current.rsvps, eventId],
      rsvpLocations: { ...current.rsvpLocations, [eventId]: venue },
    }));

  const cancelRegistration: Store["cancelRegistration"] = (eventId) =>
    updateActivity((current) => {
      const rsvpLocations = { ...current.rsvpLocations };
      delete rsvpLocations[eventId];
      return { ...current, rsvps: current.rsvps.filter((id) => id !== eventId), rsvpLocations };
    });

  const toggleChapter: Store["toggleChapter"] = (name) => {
    const joined = !activity.joinedChapters.includes(name);
    updateActivity((current) => ({
      ...current,
      joinedChapters: current.joinedChapters.includes(name) ? current.joinedChapters.filter((entry) => entry !== name) : [...current.joinedChapters, name],
    }));
    return joined;
  };

  const markNoticeRead: Store["markNoticeRead"] = (id) =>
    updateActivity((current) => ({ ...current, notices: current.notices.map((notice) => (notice.id === id ? { ...notice, read: true } : notice)) }));

  const markAllNoticesRead = () =>
    updateActivity((current) => ({ ...current, notices: current.notices.map((notice) => ({ ...notice, read: true })) }));

  const startThread: Store["startThread"] = ({ topic, title, body, chapter, location }) => {
    const id = `user-${Date.now()}`;
    const paragraphs = body.split(/\n{2,}/).map((part) => part.trim()).filter(Boolean);
    const thread: UserThread = {
      id,
      chapter,
      location,
      topic,
      title: title.trim(),
      excerpt: paragraphs[0] ?? "",
      body: paragraphs.length ? paragraphs : [body.trim()],
      author: VIEWER_ID,
      age: "Just now",
      replies: 0,
      likes: 0,
      comments: [],
    };
    updateActivity((current) => ({ ...current, userThreads: [thread, ...current.userThreads] }));
    return id;
  };

  const replyToThread: Store["replyToThread"] = (threadId, body) => {
    const comment: ForumComment = { id: `r-${Date.now()}`, author: VIEWER_ID, age: "Just now", body: body.trim(), likes: 0 };
    updateActivity((current) => ({ ...current, threadReplies: { ...current.threadReplies, [threadId]: [...(current.threadReplies[threadId] ?? []), comment] } }));
  };

  const toggleThreadLike: Store["toggleThreadLike"] = (threadId) =>
    updateActivity((current) => ({
      ...current,
      likedThreads: current.likedThreads.includes(threadId) ? current.likedThreads.filter((id) => id !== threadId) : [...current.likedThreads, threadId],
    }));

  const sendMessage: Store["sendMessage"] = (conversationId, body) =>
    updateActivity((current) => ({ ...current, dms: { ...current.dms, [conversationId]: [...(current.dms[conversationId] ?? []), { from: VIEWER_ID, time: "Just now", body: body.trim() }] } }));

  const allConversations = useMemo<Conversation[]>(() => [...activity.startedConversations, ...conversations], [activity.startedConversations]);

  const openConversationWith: Store["openConversationWith"] = (personId) => {
    const existing = allConversations.find((conversation) => conversation.kind === "Direct" && conversation.members[0] === personId);
    if (existing) return existing.id;
    const other = byId(personId);
    const id = `dm-${personId}`;
    const conversation: Conversation = {
      id,
      kind: "Direct",
      title: other.name,
      subtitle: `Direct conversation · ${other.chapter} chapter`,
      preview: "No messages yet",
      time: "Now",
      unread: 0,
      members: [personId],
      history: [],
    };
    updateActivity((current) => (current.startedConversations.some((item) => item.id === id) ? current : { ...current, startedConversations: [conversation, ...current.startedConversations] }));
    return id;
  };

  const markConversationRead: Store["markConversationRead"] = (id) =>
    updateActivity((current) => (current.readConversations.includes(id) ? current : { ...current, readConversations: [...current.readConversations, id] }));

  const unreadCount = activity.notices.filter((notice) => !notice.read).length;

  const value: Store = {
    ...activity,
    hydrated: hydrated && (SHOWCASE_REVIEW_MODE || !auth.loading),
    signedIn: account !== null && (state.currentEmail === DEMO_EMAIL || auth.user !== null),
    account,
    viewer,
    person,
    unreadCount,
    authError: SHOWCASE_REVIEW_MODE ? null : auth.error,
    retryAuth: auth.refreshUser,
    signUp,
    signIn,
    signInWithGoogle,
    continueAsDemo,
    signOut,
    updateAccount,
    updateSettings,
    updateNotificationPrefs,
    resetAccount,
    toggleFollow,
    chooseLocation,
    cancelRegistration,
    toggleChapter,
    markNoticeRead,
    markAllNoticesRead,
    startThread,
    replyToThread,
    toggleThreadLike,
    sendMessage,
    openConversationWith,
    markConversationRead,
    allConversations,
  };

  return <ShowcaseContext.Provider value={value}>{children}</ShowcaseContext.Provider>;
}

export function useShowcase() {
  const store = useContext(ShowcaseContext);
  if (!store) throw new Error("useShowcase must be used inside <ShowcaseProvider>");
  return store;
}
