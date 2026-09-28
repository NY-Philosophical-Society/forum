"use client";

import Link from "next/link";
import { createContext, FormEvent, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ChapterSummary, DirectoryEntry, Post, PublicUser, TagWithCount, ThreadDetail, ThreadSummary } from "@nyps-forum/shared";
import { useAuth } from "~/lib/auth-context";
import { Markdown } from "../markdown";
import {
  careTeam,
  chapters,
  events,
  forumThreads,
  locationName,
  LUMA_CALENDAR_URL,
  others,
  people,
  VIEWER_ID,
  type EventItem,
  type EventSession,
  type SessionStatus,
  type ForumComment,
  type Person,
} from "./data";
import { DEMO_EMAIL, ShowcaseProvider, useShowcase, type Notice, type Settings } from "./store";
import { SHOWCASE_REVIEW_MODE } from "./review-mode";
import { forumApi, forumFailureMessage, optimisticThreadLike, orderReplyRows } from "./forum-api";
import { memberApi } from "./member-api";

type View =
  | "home"
  | "events"
  | "event"
  | "forum"
  | "compose"
  | "guidelines"
  | "people"
  | "profile"
  | "messages"
  | "discussion"
  | "settings";

type IconName =
  | "home"
  | "calendar"
  | "people"
  | "chapters"
  | "search"
  | "bell"
  | "arrow"
  | "pin"
  | "clock"
  | "globe"
  | "message"
  | "check"
  | "plus"
  | "chevron"
  | "shield"
  | "spark"
  | "settings"
  | "close"
  | "logout"
  | "heart"
  | "external";

type SettingsSection = "profile" | "privacy" | "notifications" | "account";

type ComposePreset = { topic?: string; title?: string; chapter?: string; location?: string | null };

// Navigation lives in its own context so deep components (a comment, a search
// result, a notification) can move the member around without prop threading.
type App = {
  view: View;
  navigate: (view: View) => void;
  goBack: (fallback: View) => void;
  selectEvent: (id: string, focus?: "locations") => void;
  selectPerson: (id: string) => void;
  viewOwnProfile: () => void;
  openThread: (id: string) => void;
  openConversation: (id: string) => void;
  openSettings: (section?: SettingsSection) => void;
  compose: (preset?: ComposePreset) => void;
  notify: (message: string) => void;
  openSearch: () => void;
  openNewMessage: () => void;
};

const AppContext = createContext<App | null>(null);

function useApp() {
  const app = useContext(AppContext);
  if (!app) throw new Error("useApp must be used inside the showcase shell");
  return app;
}

const THREAD_TOPICS = ["Ethics", "Political philosophy", "Philosophy of mind", "Aesthetics", "Existentialism", "Metaphysics"];
const DISCUSSION_PRINCIPLES = [
  { title: "Respond to the idea, not the person", body: "Disagree as hard as the argument deserves. Never make it about who someone is, what they look like, or where they come from." },
  { title: "Ask before you assert", body: "Most good threads start with a question you do not know the answer to. Curiosity travels further here than certainty." },
  { title: "Real names, real accountability", body: "The club runs on real names so that people speak the way they would across a table. Impersonation and alternate accounts are removed." },
  { title: "Make space for quieter voices", body: "If you have replied three times in a row, let someone else in. Long monologues belong in a thread of their own." },
  { title: "No contact that wasn't asked for", body: "Following someone home, repeatedly messaging after no reply, or pressing for personal details is not tolerated — at an event or online." },
  { title: "When something is wrong, tell someone", body: "Any member can raise a concern with a named volunteer from Messages. You choose what happens next, and it is never made public." },
];

/* ------------------------------------------------------------------ */
/* Primitives                                                          */
/* ------------------------------------------------------------------ */

function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  const paths: Record<IconName, React.ReactNode> = {
    home: <><path d="M3 10.8 12 3l9 7.8"/><path d="M5.5 9.5V21h13V9.5M9 21v-6h6v6"/></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18"/></>,
    people: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></>,
    chapters: <><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z"/></>,
    search: <><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></>,
    bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></>,
    arrow: <><path d="m15 18-6-6 6-6"/></>,
    pin: <><path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/></>,
    clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
    globe: <><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/></>,
    message: <><path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4Z"/></>,
    check: <><path d="m5 12 4 4L19 6"/></>,
    plus: <><path d="M12 5v14M5 12h14"/></>,
    chevron: <><path d="m9 18 6-6-6-6"/></>,
    shield: <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="m9 12 2 2 4-4"/></>,
    spark: <><path d="m12 3 1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6L12 3Z"/><path d="m19 15 .8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15Z"/></>,
    settings: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/></>,
    close: <><path d="M6 6l12 12M18 6 6 18"/></>,
    logout: <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5M21 12H9"/></>,
    heart: <><path d="M19 14c1.5-1.5 3-3.2 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.8 0-3 .5-4.5 2-1.5-1.5-2.7-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4 3 5.5l7 7Z"/></>,
    external: <><path d="M14 4h6v6"/><path d="M20 4 10.5 13.5"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></>,
  };
  return <svg className="sc-icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{paths[name]}</svg>;
}

function Avatar({ person, size = "md" }: { person: Person; size?: "sm" | "md" | "lg" | "xl" }) {
  return <span className={`sc-avatar sc-avatar-${size} sc-avatar-${person.color}`} aria-hidden>{person.initials}</span>;
}

function AvatarStack({ ids, max = 4 }: { ids: string[]; max?: number }) {
  const { person } = useShowcase();
  const visible = ids.slice(0, max).map((id) => person(id));
  return (
    <div className="sc-avatar-stack" aria-label={`${ids.length} people`}>
      {visible.map((entry) => <Avatar person={entry} size="sm" key={entry.id} />)}
      {ids.length > max && <span className="sc-avatar-more">+{ids.length - max}</span>}
    </div>
  );
}

function EventDate({ event, compact = false }: { event: EventItem; compact?: boolean }) {
  return (
    <span className={`sc-event-date ${compact ? "sc-event-date-compact" : ""}`}>
      <span>{event.month}</span>
      <strong>{event.day}</strong>
    </span>
  );
}

function Toggle({ checked, onChange, label, description }: { checked: boolean; onChange: (value: boolean) => void; label: string; description: string }) {
  return (
    <label className="sc-toggle-row">
      <span className="sc-toggle-copy">
        <strong>{label}</strong>
        <em>{description}</em>
      </span>
      <button type="button" role="switch" aria-checked={checked} className={checked ? "sc-switch on" : "sc-switch"} onClick={() => onChange(!checked)}>
        <span />
      </button>
    </label>
  );
}

// Closes on Escape and locks page scroll while an overlay owns focus.
function useOverlay(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);
}

// Registration copy follows the real status of the locations, so the button never
// promises a seat that the calendar shows as full.
function reserveLabel(sessions: EventSession[]) {
  if (sessions.some((session) => session.status === "Open")) return "Reserve a spot";
  if (sessions.some((session) => session.status === "Waitlist")) return "Join a waitlist";
  if (sessions.every((session) => session.status === "Preview")) return "Get notified";
  return "Fully booked";
}

// Joining a waitlist is not the same as having a seat, so the confirmation says which.
function signedUpLabel(status: SessionStatus) {
  if (status === "Waitlist") return "On the waitlist";
  if (status === "Preview") return "You'll be notified";
  return "You're going";
}

// The location a member picked for an event, or null when they haven't picked one.
function chosenSession(event: EventItem, registrations: { rsvps: string[]; rsvpLocations: Record<string, string> }) {
  if (!registrations.rsvps.includes(event.id)) return null;
  const venue = registrations.rsvpLocations[event.id];
  return event.sessions.find((session) => session.venue === venue) ?? event.sessions.find((session) => session.status !== "Sold out") ?? event.sessions[0];
}

const LUMA_TOAST: Record<SessionStatus, string> = {
  Open: "Luma opened in a new tab. Finish registering there.",
  Waitlist: "Luma opened in a new tab. Join the waitlist there.",
  Preview: "Luma opened in a new tab. Registration opens 13 days before, at noon.",
  "Sold out": "Luma opened in a new tab.",
};

// Registration completes on the club's real Luma page for that location. Opening it
// also records the member's choice, so the rest of the platform knows where they're headed.
function LumaLink({ event, session, className, children }: { event: EventItem; session: EventSession; className: string; children: React.ReactNode }) {
  const store = useShowcase();
  const app = useApp();
  if (!session.lumaUrl) return null;
  return (
    <a
      className={className}
      href={session.lumaUrl}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => {
        if (session.status !== "Sold out") store.chooseLocation(event.id, session.venue);
        app.notify(LUMA_TOAST[session.status]);
      }}
    >
      {children}
      <Icon name="external" size={14} />
      <span className="sc-visually-hidden"> (opens Luma in a new tab)</span>
    </a>
  );
}

// The event-level call to action. A single bookable location goes straight to its
// Luma page; several send the member to choose one first, since each has its own page.
function EventCta({ event, className, onChoose, showLocation = true }: { event: EventItem; className: string; onChoose: () => void; showLocation?: boolean }) {
  const store = useShowcase();
  if (event.past) return null;
  const chosen = chosenSession(event, store);
  if (chosen) {
    return (
      <button className={`${className} is-confirmed active`} onClick={onChoose}>
        <Icon name="check" size={16} />
        {signedUpLabel(chosen.status)}{showLocation && event.sessions.length > 1 ? ` · ${chosen.neighborhood}` : ""}
      </button>
    );
  }
  const bookable = event.sessions.filter((session) => session.status !== "Sold out");
  if (bookable.length === 1 && bookable[0].lumaUrl) {
    return <LumaLink event={event} session={bookable[0]} className={className}>{reserveLabel(event.sessions)}</LumaLink>;
  }
  if (bookable.length === 0 && event.sessions.length === 1 && event.sessions[0].lumaUrl) {
    return <LumaLink event={event} session={event.sessions[0]} className={className}>Sold out · View on Luma</LumaLink>;
  }
  return <button className={className} onClick={onChoose}>{reserveLabel(event.sessions)}<Icon name="chevron" size={16} /></button>;
}

function locationLabel(count: number) {
  return `${count} ${count === 1 ? "location" : "locations"}`;
}

/* ------------------------------------------------------------------ */
/* Front door: the app is members-only                                 */
/* ------------------------------------------------------------------ */

function SplashScreen() {
  return (
    <div className="sc-splash" aria-busy="true">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/nypc-icon.png" alt="" />
    </div>
  );
}

function LoginScreen() {
  const store = useShowcase();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function switchMode(next: "signin" | "signup") {
    setMode(next);
    setErrors({});
    setMessage("");
  }

  function validate() {
    const next: Record<string, string> = {};
    if (mode === "signup" && name.trim().split(/\s+/).length < 2) next.name = "Use your first and last name — the club runs on real names.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) next.email = "Enter an email address like name@example.com.";
    if (mode === "signup" && password.length < 8) next.password = "Passwords need at least 8 characters.";
    if (mode === "signin" && !password) next.password = "Enter your password.";
    if (mode === "signup" && confirmPassword !== password) next.confirmPassword = "Passwords do not match.";
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    setErrors({});
    setMessage("");
    const result = mode === "signup"
      ? await store.signUp({ name, email, password })
      : await store.signIn(email, password);
    setSubmitting(false);
    if (!result.ok) setErrors({ form: result.error });
    else if (result.confirmationRequired) setMessage("Check your email to confirm the account, then return here to log in.");
  }

  async function continueWithGoogle() {
    setSubmitting(true);
    const result = await store.signInWithGoogle();
    if (!result.ok) {
      setErrors({ form: result.error });
      setSubmitting(false);
    }
  }

  if (SHOWCASE_REVIEW_MODE) return (
    <div className="sc-login">
      <section className="sc-login-brand">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <div className="sc-login-mark"><img src="/nypc-icon.png" alt="" /><span><strong>New York</strong><em>Philosophy Club</em></span></div>
        <div className="sc-login-thesis"><h1>Pursuing wisdom, together.</h1><p>Explore the proposed forum experience before connecting it to club data.</p></div>
        <ul className="sc-login-cities" aria-label="Chapters">{chapters.map((item) => <li key={item.name}>{item.name}</li>)}</ul>
      </section>
      <section className="sc-login-panel"><div className="sc-login-card">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <div className="sc-login-mobile-mark"><img src="/nypc-icon.png" alt="" /><span><strong>New York</strong><em>Philosophy Club</em></span></div>
        <h2>Review the forum upgrade</h2>
        <p className="sc-login-lede">This interactive preview uses illustrative people and discussions. It does not create an account or change club records.</p>
        <button type="button" className="sc-primary-button sc-block" onClick={store.continueAsDemo}>Explore the preview</button>
        <a className="sc-guest-access" href={LUMA_CALENDAR_URL} target="_blank" rel="noopener noreferrer"><strong>See current club events</strong><span>Dates and registration are maintained on the official calendar.</span></a>
        <p className="sc-auth-note">Account and forum integrations are being verified separately before a connected release.</p>
      </div></section>
    </div>
  );

  return (
    <div className="sc-login">
      <section className="sc-login-brand">
        <div className="sc-login-mark">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/nypc-icon.png" alt="" />
          <span><strong>New York</strong><em>Philosophy Club</em></span>
        </div>
        <div className="sc-login-thesis">
          <h1>Pursuing wisdom, together.</h1>
          <p>The members&rsquo; space for the club: events, discussion, and the people you meet on Wednesday nights.</p>
        </div>
        <ul className="sc-login-cities" aria-label="Chapters">
          {chapters.map((item) => <li key={item.name}>{item.name}</li>)}
        </ul>
      </section>

      <section className="sc-login-panel">
        <div className="sc-login-card">
          <div className="sc-login-mobile-mark">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/nypc-icon.png" alt="" />
            <span><strong>New York</strong><em>Philosophy Club</em></span>
          </div>
          <h2>{mode === "signin" ? "Log in" : "Create your account"}</h2>
          <p className="sc-login-lede">{mode === "signin" ? "Welcome back. Log in to see events, discussions, and members." : "An account is free; supporter access and formal Society membership are separate. Please use your real name."}</p>

          {store.authError && (
            <div className="sc-form-error" role="alert">
              <span>{store.authError === "session-rejected"
                ? "This signed-in account cannot access the forum."
                : "You are signed in, but the forum could not load your account."}</span>
              <span className="sc-auth-recovery">
                {store.authError === "account-unavailable" && (
                  <button type="button" className="sc-text-link" onClick={() => void store.retryAuth()}>Try again</button>
                )}
                <button type="button" className="sc-text-link" onClick={() => void store.signOut()}>Use another account</button>
              </span>
            </div>
          )}

          {process.env.NEXT_PUBLIC_GOOGLE_SIGN_IN_ENABLED === "true" && (
            <>
              <button type="button" className="sc-google-button sc-block" onClick={continueWithGoogle} disabled={submitting}>
                <span className="sc-google-mark" aria-hidden="true">G</span>
                Continue with Google
              </button>
              <div className="sc-auth-divider"><span>or continue with email</span></div>
            </>
          )}

          <form className="sc-auth-form" onSubmit={submit} noValidate>
            {mode === "signup" && (
              <label className="sc-input-field">
                <span>Full name</span>
                <input value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" placeholder="Hannah Arendt" aria-invalid={!!errors.name} />
                {errors.name && <em className="sc-field-error">{errors.name}</em>}
              </label>
            )}
            <label className="sc-input-field">
              <span>Email</span>
              <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" placeholder="you@example.com" aria-invalid={!!errors.email} />
              {errors.email && <em className="sc-field-error">{errors.email}</em>}
            </label>
            <label className="sc-input-field">
              <span className="sc-label-row">Password{mode === "signin" && <a className="sc-text-link" href="/forgot-password">Forgot?</a>}</span>
              <span className="sc-password-field"><input type={showPassword ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={mode === "signup" ? "new-password" : "current-password"} placeholder={mode === "signup" ? "At least 8 characters" : "Your password"} aria-label="Password" aria-invalid={!!errors.password} /><button type="button" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? "Hide password" : "Show password"}>{showPassword ? "Hide" : "Show"}</button></span>
              {errors.password && <em className="sc-field-error">{errors.password}</em>}
            </label>
            {mode === "signup" && <label className="sc-input-field">
              <span>Confirm password</span>
              <input type={showPassword ? "text" : "password"} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" aria-invalid={!!errors.confirmPassword}/>
              {errors.confirmPassword && <em className="sc-field-error">{errors.confirmPassword}</em>}
            </label>}
            {errors.form && <p className="sc-form-error" role="alert">{errors.form}</p>}
            {message && <p className="sc-form-success" role="status">{message}</p>}
            <button type="submit" className="sc-primary-button sc-block" disabled={submitting}>{submitting ? "Connecting…" : mode === "signin" ? "Log in" : "Create account"}</button>
          </form>

          <p className="sc-login-switch">
            {mode === "signin" ? <>New to the club? <button className="sc-text-link" onClick={() => switchMode("signup")}>Create an account</button></> : <>Already a member? <button className="sc-text-link" onClick={() => switchMode("signin")}>Log in</button></>}
          </p>

          <Link className="sc-guest-access" href="/">
            <strong>Browse public discussions</strong>
            <span>No account needed for the feed and short previews.</span>
          </Link>

          {process.env.NODE_ENV !== "production" && <>
            <div className="sc-auth-divider"><span>local prototype preview</span></div>
            <button className="sc-quiet-button sc-block" onClick={store.continueAsDemo}>Explore sample content</button>
          </>}
          <p className="sc-auth-note">Signed-in forum activity is saved to your account. Unfinished showcase screens are marked as previews.</p>
        </div>
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Shell: navigation, search, notifications                            */
/* ------------------------------------------------------------------ */

function AppNav({ noticesOpen, setNoticesOpen }: { noticesOpen: boolean; setNoticesOpen: (open: boolean) => void }) {
  const store = useShowcase();
  const app = useApp();
  const [menuOpen, setMenuOpen] = useState(false);

  const items: { view: View; label: string; icon: IconName }[] = [
    { view: "home", label: "Home", icon: "home" },
    { view: "events", label: "Events", icon: "calendar" },
    { view: "forum", label: "Forum", icon: "message" },
    { view: "people", label: "Community", icon: "people" },
    { view: "messages", label: "Messages", icon: "message" },
  ];

  const isActive = (item: View) =>
    app.view === item ||
    (item === "events" && ["event", "discussion"].includes(app.view)) ||
    (item === "forum" && ["compose", "guidelines"].includes(app.view)) ||
    (item === "people" && app.view === "profile");

  useOverlay(menuOpen, () => setMenuOpen(false));

  function go(next: View) {
    setMenuOpen(false);
    app.navigate(next);
  }

  function signOut() {
    setMenuOpen(false);
    store.signOut();
  }

  return (
    <>
      <header className="sc-topbar">
        <button className="sc-menu-toggle" onClick={() => setMenuOpen(true)} aria-label="Open menu" aria-expanded={menuOpen}>
          <span/><span/><span/>
        </button>
        <button className="sc-brand" onClick={() => go("home")} aria-label="New York Philosophy Club home">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/nypc-icon.png" alt="" />
          <span><strong>New York</strong><em>Philosophy Club</em></span>
        </button>
        <nav className="sc-main-nav" aria-label="Main navigation">
          {items.map((item) => (
            <button key={item.view} className={isActive(item.view) ? "active" : ""} onClick={() => go(item.view)}>
              {item.label}
            </button>
          ))}
        </nav>
        <div className="sc-account-actions">
          <button className="sc-icon-button" aria-label="Search" onClick={app.openSearch}><Icon name="search" /></button>
          <div className="sc-notice-anchor">
            {store.account?.email === DEMO_EMAIL ? <>
              <button className={`sc-icon-button ${store.unreadCount > 0 ? "sc-has-dot" : ""}`} aria-label={`Notifications${store.unreadCount ? `, ${store.unreadCount} unread` : ""}`} aria-expanded={noticesOpen} onClick={() => setNoticesOpen(!noticesOpen)}><Icon name="bell" /></button>
              {noticesOpen && <NotificationsPanel onClose={() => setNoticesOpen(false)} />}
            </> : <a className="sc-icon-button" aria-label="Notifications" href="/notifications"><Icon name="bell" /></a>}
          </div>
          <button className="sc-user-chip" onClick={() => { setNoticesOpen(false); setMenuOpen(true); }} aria-label="Open account menu" aria-expanded={menuOpen} aria-controls="sc-account-drawer">
            <Avatar person={store.viewer} size="sm" />
            <span>{store.viewer.name.split(" ")[0]}</span>
          </button>
        </div>
      </header>

      <div className={menuOpen ? "sc-drawer-scrim open" : "sc-drawer-scrim"} onClick={() => setMenuOpen(false)} aria-hidden={!menuOpen} />
      <aside id="sc-account-drawer" className={menuOpen ? "sc-drawer open" : "sc-drawer"} aria-hidden={!menuOpen}>
        <div className="sc-drawer-head">
          <button className="sc-drawer-identity" onClick={() => { setMenuOpen(false); app.viewOwnProfile(); }}>
            <Avatar person={store.viewer} size="md" />
            <span><strong>{store.viewer.name}</strong><em>{store.account?.email === DEMO_EMAIL ? `${store.viewer.chapter} chapter` : "Forum account"}</em></span>
          </button>
          <button className="sc-drawer-close" onClick={() => setMenuOpen(false)} aria-label="Close menu"><Icon name="close" size={18} /></button>
        </div>
        <nav className="sc-drawer-nav" aria-label="Menu">
          {items.map((item) => (
            <button key={item.view} className={isActive(item.view) ? "active" : ""} onClick={() => go(item.view)}>
              <Icon name={item.icon} size={19} />{item.label}
            </button>
          ))}
          <button className={app.view === "settings" ? "active" : ""} onClick={() => { setMenuOpen(false); app.openSettings(); }}>
            <Icon name="settings" size={19} />Settings
          </button>
        </nav>
        <div className="sc-drawer-foot">
          <button onClick={() => go("messages")}><Icon name="shield" size={17}/>Tell an organizer something</button>
          <button onClick={signOut}><Icon name="logout" size={17}/>Log out</button>
          <p>New York · Los Angeles · Princeton · Tampa Bay</p>
        </div>
      </aside>
    </>
  );
}

function NotificationsPanel({ onClose }: { onClose: () => void }) {
  const store = useShowcase();
  const app = useApp();
  const panelRef = useRef<HTMLDivElement>(null);
  const prefs = store.settings.notifications;

  // Notification preferences are honoured here, so switching a type off in
  // Settings visibly removes it from the list.
  const visible = store.notices.filter((notice) => {
    if (notice.kind === "reply") return prefs.replies;
    if (notice.kind === "mention") return prefs.mentions;
    if (notice.kind === "message") return prefs.messages;
    if (notice.kind === "event") return prefs.events;
    return true;
  });

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (panelRef.current && !panelRef.current.parentElement?.contains(event.target as Node)) onClose();
    };
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  function open(notice: Notice) {
    store.markNoticeRead(notice.id);
    onClose();
    const target = notice.target;
    if (target.view === "thread") app.openThread(target.id);
    else if (target.view === "event") app.selectEvent(target.id);
    else if (target.view === "profile") app.selectPerson(target.id);
    else app.openConversation(target.id);
  }

  return (
    <div className="sc-notices-panel" ref={panelRef} role="dialog" aria-label="Notifications">
      <header>
        <strong>Notifications</strong>
        <div>
          {store.unreadCount > 0 && <button onClick={store.markAllNoticesRead}>Mark all read</button>}
          <button onClick={() => { onClose(); app.openSettings("notifications"); }} aria-label="Notification settings"><Icon name="settings" size={16} /></button>
        </div>
      </header>
      <div className="sc-notices-list">
        {visible.map((notice) => {
          const actor = store.person(notice.actor);
          return (
            <button key={notice.id} className={notice.read ? "sc-notice" : "sc-notice unread"} onClick={() => open(notice)}>
              <Avatar person={actor} size="sm" />
              <span>
                <em><strong>{actor.name.split(" ")[0]}</strong> {notice.text}</em>
                <small>{notice.time}</small>
              </span>
              {!notice.read && <i aria-label="Unread" />}
            </button>
          );
        })}
        {visible.length === 0 && (
          <div className="sc-notices-empty">
            <Icon name="bell" size={22} />
            <p>You&rsquo;re all caught up.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function SearchOverlay({ onClose }: { onClose: () => void }) {
  const store = useShowcase();
  const app = useApp();
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  useOverlay(true, onClose);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const term = query.trim().toLowerCase();

  const results = useMemo(() => {
    if (term.length < 2) return null;
    const hit = (text: string) => text.toLowerCase().includes(term);
    const directory = [...(store.settings.directoryVisible ? [store.viewer] : []), ...others];
    const allThreads = [...store.userThreads, ...forumThreads];
    return {
      events: events.filter((event) => hit(`${event.title} ${event.summary} ${event.kind} ${event.sessions.map((session) => `${session.venue} ${session.neighborhood}`).join(" ")}`)).slice(0, 5),
      threads: allThreads.filter((thread) => hit(`${thread.title} ${thread.excerpt} ${thread.topic} ${thread.chapter} ${locationName(thread.chapter, thread.location) ?? ""}`)).slice(0, 5),
      members: directory.filter((member) => hit(`${member.name} ${member.role} ${member.location} ${member.chapter} ${member.interests.join(" ")}`)).slice(0, 5),
    };
  }, [term, store.userThreads, store.settings.directoryVisible, store.viewer]);

  const total = results ? results.events.length + results.threads.length + results.members.length : 0;
  const suggestions = ["Williamsburg", "Consciousness", "Room 52", "Princeton", "Ethics"];

  function go(action: () => void) {
    onClose();
    action();
  }

  return (
    <div className="sc-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="sc-search" role="dialog" aria-label="Search the community">
        <label className="sc-search-field">
          <Icon name="search" size={20} />
          <input ref={inputRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search events, discussions, and members" />
          <button onClick={onClose} aria-label="Close search"><kbd>Esc</kbd></button>
        </label>

        {!results && (
          <div className="sc-search-idle">
            <span>Try</span>
            <div>{suggestions.map((item) => <button key={item} onClick={() => setQuery(item)}>{item}</button>)}</div>
          </div>
        )}

        {results && total === 0 && (
          <div className="sc-search-empty">
            <p>Nothing matches &ldquo;{query}&rdquo;.</p>
            <span>Try a neighborhood, a topic, or someone&rsquo;s name.</span>
          </div>
        )}

        {results && total > 0 && (
          <div className="sc-search-results">
            {results.events.length > 0 && (
              <section>
                <h3>Events</h3>
                {results.events.map((event) => (
                  <button key={event.id} onClick={() => go(() => app.selectEvent(event.id))}>
                    <EventDate event={event} compact />
                    <span><strong>{event.title}</strong><em>{event.dateLabel} · {event.sessions.map((session) => session.neighborhood).join(", ")}</em></span>
                    <Icon name="chevron" size={15} />
                  </button>
                ))}
              </section>
            )}
            {results.threads.length > 0 && (
              <section>
                <h3>Discussions</h3>
                {results.threads.map((thread) => (
                  <button key={thread.id} onClick={() => go(() => app.openThread(thread.id))}>
                    <span className="sc-search-mark"><Icon name="message" size={16} /></span>
                    <span><strong>{thread.title}</strong><em>{thread.chapter} · {thread.topic} · {thread.replies} replies</em></span>
                    <Icon name="chevron" size={15} />
                  </button>
                ))}
              </section>
            )}
            {results.members.length > 0 && (
              <section>
                <h3>Members</h3>
                {results.members.map((member) => (
                  <button key={member.id} onClick={() => go(() => (member.id === VIEWER_ID ? app.viewOwnProfile() : app.selectPerson(member.id)))}>
                    <Avatar person={member} size="sm" />
                    <span><strong>{member.name}{member.id === VIEWER_ID ? " (you)" : ""}</strong><em>{member.role} · {member.chapter}</em></span>
                    <Icon name="chevron" size={15} />
                  </button>
                ))}
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function NewMessagePicker({ onClose }: { onClose: () => void }) {
  const store = useShowcase();
  const app = useApp();
  const [query, setQuery] = useState("");
  useOverlay(true, onClose);
  const matches = others.filter((member) => `${member.name} ${member.chapter} ${member.interests.join(" ")}`.toLowerCase().includes(query.trim().toLowerCase()));

  return (
    <div className="sc-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="sc-picker" role="dialog" aria-label="Start a conversation">
        <header>
          <h2>New message</h2>
          <button onClick={onClose} aria-label="Close"><Icon name="close" size={18} /></button>
        </header>
        <label className="sc-search-box"><Icon name="search" size={18} /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find a member" /></label>
        <div className="sc-picker-list">
          {matches.map((member) => (
            <button key={member.id} onClick={() => { const id = store.openConversationWith(member.id); onClose(); app.openConversation(id); }}>
              <Avatar person={member} size="md" />
              <span><strong>{member.name}</strong><em>{member.role} · {member.chapter}</em></span>
              <Icon name="chevron" size={15} />
            </button>
          ))}
          {matches.length === 0 && <p className="sc-inbox-empty">No members match &ldquo;{query}&rdquo;.</p>}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Home                                                                */
/* ------------------------------------------------------------------ */

function calendarDate(value: string | null | undefined, compact = false) {
  if (!value) return "Date to be announced";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date to be announced";
  return date.toLocaleString(undefined, compact
    ? { month: "short", day: "numeric", timeZone: "America/New_York" }
    : { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "America/New_York" });
}

function ReviewHomeView() {
  const app = useApp();
  return <main className="sc-page sc-home-page">
    <section className="sc-hero">
      <div className="sc-hero-plate">
        <p className="sc-hero-when">New York Philosophy Club</p>
        <h1>A place for good questions.</h1>
        <p className="sc-hero-line">Explore how the next forum experience brings discussions, events, and people together.</p>
        <div className="sc-hero-actions"><button className="sc-primary-button" onClick={() => app.navigate("forum")}>Explore discussions</button><a className="sc-quiet-button sc-on-dark" href={LUMA_CALENDAR_URL} target="_blank" rel="noopener noreferrer">Current club events <Icon name="external" size={16}/></a></div>
      </div>
      <div className="sc-hero-rooms">
        <span className="sc-hero-rooms-label">Your community</span>
        <p>See how an opt-in directory and continuing conversations can connect people beyond an event.</p>
        <button className="sc-hero-calendar" onClick={() => app.navigate("people")}><Icon name="people" size={16}/> Explore the directory</button>
        <button className="sc-hero-calendar" onClick={() => app.navigate("forum")}><Icon name="message" size={16}/> Open discussions</button>
        <p className="sc-hero-rooms-note">Profiles and discussions in this review are illustrative, not club records.</p>
      </div>
    </section>
    <section className="sc-section sc-conversation-section">
      <div className="sc-section-heading"><div><h2>Conversation preview</h2><p>Illustrative threads show the proposed reading and posting experience.</p></div><button className="sc-text-action" onClick={() => app.navigate("forum")}>Open the forum <Icon name="chevron" size={16}/></button></div>
      <div className="sc-connected-discussions">{forumThreads.slice(0, 3).map((thread) => <button key={thread.id} onClick={() => app.openThread(thread.id)}><span>{thread.topic}</span><strong>{thread.title}</strong><em>Sample discussion - not a club record</em></button>)}</div>
    </section>
  </main>;
}

function ReviewEventsView() {
  return <main className="sc-page sc-list-page">
    <section className="sc-page-intro"><div><h1>Events</h1><p>The forum can carry event discussions; the official calendar remains the source for current dates and registration.</p></div><a className="sc-quiet-button" href={LUMA_CALENDAR_URL} target="_blank" rel="noopener noreferrer">Open club calendar <Icon name="external" size={15}/></a></section>
    <section className="sc-event-list"><div className="sc-empty-state"><Icon name="calendar" size={28}/><h2>Current events are on the club calendar</h2><p>This review does not copy event dates into a disconnected demo. Event discussions will appear here after the approved data connection is tested.</p><a className="sc-quiet-button" href={LUMA_CALENDAR_URL} target="_blank" rel="noopener noreferrer">View current schedule</a></div></section>
  </main>;
}

function ConnectedHomeView() {
  const app = useApp();
  const { token } = useAuth();
  const [upcoming, setUpcoming] = useState<ThreadSummary[]>([]);
  const [discussions, setDiscussions] = useState<ThreadSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    Promise.all([
      forumApi.feed({ sort: "new", kind: "event", period: "upcoming", limit: 4 }, token, { signal: controller.signal }),
      forumApi.feed({ sort: "new", limit: 3 }, token, { signal: controller.signal }),
    ]).then(([eventFeed, discussionFeed]) => {
      if (controller.signal.aborted) return;
      setUpcoming(eventFeed.threads);
      setDiscussions(discussionFeed.threads);
    }).catch((failure) => {
      if (!controller.signal.aborted) setError(forumFailureMessage(failure, "load your home feed"));
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [token, reload]);

  const featured = upcoming[0];
  return <main className="sc-page sc-home-page">
    {error && <div className="sc-connection-error" role="alert">{error} <button onClick={() => setReload((value) => value + 1)}>Try again</button></div>}
    <section className="sc-hero">
      <div className="sc-hero-plate">
        <p className="sc-hero-when">{featured ? calendarDate(featured.eventDate) : "New York Philosophy Club"}</p>
        <h1>{featured?.title ?? "A place for good questions."}</h1>
        <p className="sc-hero-line">{featured ? "Explore the event conversation and check the club calendar for registration details." : loading ? "Loading the next gathering…" : "No upcoming event is posted in the forum yet. Check the club calendar for the latest gatherings."}</p>
        <div className="sc-hero-actions">
          {featured && <button className="sc-primary-button" onClick={() => app.selectEvent(featured.id)}>Event details</button>}
          <a className="sc-quiet-button sc-on-dark" href={LUMA_CALENDAR_URL} target="_blank" rel="noopener noreferrer">Club calendar <Icon name="external" size={16}/><span className="sc-visually-hidden"> (opens in a new tab)</span></a>
        </div>
      </div>
      <div className="sc-hero-rooms">
        <span className="sc-hero-rooms-label">Your community</span>
        <p>Meet members who have opted into the directory, or continue a conversation in the forum.</p>
        <button className="sc-hero-calendar" onClick={() => app.navigate("people")}><Icon name="people" size={16}/> Member directory</button>
        <button className="sc-hero-calendar" onClick={() => app.navigate("forum")}><Icon name="message" size={16}/> Open the forum</button>
        <p className="sc-hero-rooms-note">Directory visibility is opt-in. Event registration is managed on Luma, not in this forum.</p>
      </div>
    </section>
    <section className="sc-upnext">
      <div className="sc-section-heading"><div><h2>Coming up</h2><p>Events posted by club organizers.</p></div><button className="sc-text-action" onClick={() => app.navigate("events")}>All events <Icon name="chevron" size={16}/></button></div>
      <div className="sc-upnext-row">
        {upcoming.slice(1).map((event) => <button className="sc-upnext-card" key={event.id} onClick={() => app.selectEvent(event.id)}><span className="sc-connected-date">{calendarDate(event.eventDate, true)}</span><strong>{event.title}</strong><em>{event.chapter?.name ?? "Club event"}</em><Icon name="chevron" size={16}/></button>)}
        {!loading && upcoming.length <= 1 && <p className="sc-muted-empty">No other upcoming events are posted here.</p>}
      </div>
    </section>
    <section className="sc-section sc-conversation-section">
      <div className="sc-section-heading"><div><h2>Conversations continuing</h2><p>Recent discussions from the real forum.</p></div><button className="sc-text-action" onClick={() => app.navigate("forum")}>Open the forum <Icon name="chevron" size={16}/></button></div>
      <div className="sc-connected-discussions">
        {discussions.map((thread) => <button key={thread.id} onClick={() => app.openThread(thread.id)}><span>{thread.topicLabel ?? thread.tags[0]?.name ?? "Discussion"}</span><strong>{thread.title}</strong><em>{thread.author.displayName} · {thread.postCount} replies</em></button>)}
        {!loading && discussions.length === 0 && <p className="sc-muted-empty">No discussions have been posted yet.</p>}
      </div>
    </section>
  </main>;
}

function FollowButton({ personId, name, following, large = false }: { personId: string; name: string; following: boolean; large?: boolean }) {
  const store = useShowcase();
  const app = useApp();
  function toggle() {
    const nowFollowing = store.toggleFollow(personId);
    app.notify(nowFollowing ? `You're following ${name}` : `You unfollowed ${name}`);
  }
  if (large) {
    return (
      <button className={`sc-primary-button ${following ? "is-confirmed" : ""}`} onClick={toggle}>
        <Icon name={following ? "check" : "plus"} size={17} />{following ? "Following" : "Follow"}
      </button>
    );
  }
  return <button className={`sc-follow-button ${following ? "active" : ""}`} onClick={toggle}>{following ? "Following" : "Follow"}</button>;
}

/* ------------------------------------------------------------------ */
/* Events                                                              */
/* ------------------------------------------------------------------ */

function ConnectedEventsView() {
  const app = useApp();
  const { token } = useAuth();
  const [period, setPeriod] = useState<"upcoming" | "past">("upcoming");
  const [items, setItems] = useState<ThreadSummary[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const pageRequest = useRef<AbortController | null>(null);
  const loadingMoreRef = useRef(false);

  useEffect(() => {
    pageRequest.current?.abort();
    const controller = new AbortController();
    pageRequest.current = controller;
    setLoading(true);
    loadingMoreRef.current = false;
    setLoadingMore(false);
    setItems([]);
    setHasMore(false);
    setError("");
    forumApi.feed({ sort: "new", kind: "event", period, limit: 20 }, token, { signal: controller.signal })
      .then((feed) => { if (!controller.signal.aborted) { setItems(feed.threads); setHasMore(feed.hasMore); } })
      .catch((failure) => { if (!controller.signal.aborted) setError(forumFailureMessage(failure, "load events")); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [period, reload, token]);

  async function loadMore() {
    if (!hasMore || loadingMoreRef.current) return;
    loadingMoreRef.current = true;
    const controller = new AbortController();
    pageRequest.current = controller;
    setLoadingMore(true);
    setError("");
    try {
      const feed = await forumApi.feed({ sort: "new", kind: "event", period, limit: 20, offset: items.length }, token, { signal: controller.signal });
      if (!controller.signal.aborted) {
        setItems((current) => [...current, ...feed.threads.filter((thread) => !current.some((item) => item.id === thread.id))]);
        setHasMore(feed.hasMore);
      }
    } catch (failure) {
      if (!controller.signal.aborted) setError(forumFailureMessage(failure, "load more events"));
    } finally { loadingMoreRef.current = false; if (!controller.signal.aborted) setLoadingMore(false); }
  }

  return <main className="sc-page sc-list-page">
    <section className="sc-page-intro"><div><h1>Events</h1><p>Club events posted in the forum. Registration and venue details live on the club calendar.</p></div><a className="sc-quiet-button" href={LUMA_CALENDAR_URL} target="_blank" rel="noopener noreferrer">Open Luma calendar <Icon name="external" size={15}/><span className="sc-visually-hidden"> (opens in a new tab)</span></a></section>
    <div className="sc-filter-row" role="group" aria-label="Filter events">
      {(["upcoming", "past"] as const).map((value) => <button key={value} className={period === value ? "active" : ""} aria-pressed={period === value} onClick={() => setPeriod(value)}>{value === "upcoming" ? "Upcoming" : "Past"}</button>)}
    </div>
    {error && <div className="sc-connection-error" role="alert">{error} <button onClick={() => setReload((value) => value + 1)}>Try again</button></div>}
    <section className="sc-event-list" aria-busy={loading || loadingMore}>
      {loading && <p role="status">Loading events…</p>}
      {items.map((event) => <article className="sc-event-row sc-connected-event" key={event.id}>
        <span className="sc-connected-date">{calendarDate(event.eventDate, true)}</span>
        <div className="sc-event-row-copy"><span className="sc-status-line"><i/> {calendarDate(event.eventDate)}</span><button className="sc-event-title" onClick={() => app.selectEvent(event.id)}>{event.title}</button><p>{event.chapter?.name ?? "Club event"} · Posted by {event.author.displayName}</p></div>
        <div className="sc-event-row-action"><button className="sc-follow-button" onClick={() => app.selectEvent(event.id)}>Event details</button></div>
      </article>)}
      {!loading && !error && items.length === 0 && <div className="sc-empty-state"><Icon name="calendar" size={28}/><h2>No {period} events posted here</h2><p>Check the club calendar for the latest registration information.</p><a className="sc-quiet-button" href={LUMA_CALENDAR_URL} target="_blank" rel="noopener noreferrer">View Luma calendar</a></div>}
    </section>
    {hasMore && <button className="sc-quiet-button" disabled={loadingMore} onClick={loadMore}>{loadingMore ? "Loading…" : "Load more events"}</button>}
  </main>;
}

function ConnectedEventView({ id }: { id: string }) {
  const app = useApp();
  const { token } = useAuth();
  const [event, setEvent] = useState<ThreadDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setEvent(null);
    setError("");
    forumApi.detail(id, token, { signal: controller.signal })
      .then((detail) => {
        if (controller.signal.aborted) return;
        if (detail.kind !== "event") { setError("This event is no longer available."); return; }
        setEvent(detail);
      })
      .catch((failure) => { if (!controller.signal.aborted) setError(forumFailureMessage(failure, "open this event")); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [id, reload, token]);
  return <main className="sc-page sc-detail-page">
    <button className="sc-back" onClick={() => app.goBack("events")}><Icon name="arrow" size={17}/> Back to events</button>
    {loading && <p role="status">Loading event…</p>}
    {error && <div className="sc-connection-error" role="alert">{error} <button onClick={() => setReload((value) => value + 1)}>Try again</button></div>}
    {event && <section className="sc-event-hero sc-connected-event-hero"><div className="sc-event-hero-main"><span className="sc-status-line"><i/> {event.chapter?.name ?? "Club event"}</span><h1>{event.title}</h1><p className="sc-event-date-line"><Icon name="calendar" size={18}/>{calendarDate(event.eventDate)}</p><div className="sc-connected-event-body"><Markdown>{event.deleted ? "This event has been removed." : event.body}</Markdown></div><div className="sc-featured-actions"><a className="sc-primary-button" href={`/t/${encodeURIComponent(event.id)}`}><Icon name="message" size={16}/> View conversation</a><a className="sc-quiet-button" href={LUMA_CALENDAR_URL} target="_blank" rel="noopener noreferrer">Registration calendar <Icon name="external" size={15}/></a></div></div><aside className="sc-event-host-card"><span>Posted by</span><strong>{event.author.displayName}</strong><p>Confirm the time, venue, and registration on Luma. Forum attendance is not a registration.</p></aside></section>}
  </main>;
}

function EventView({ event, focus }: { event: EventItem; focus: "locations" | null }) {
  const store = useShowcase();
  const app = useApp();
  const chosen = chosenSession(event, store);
  const attendees = chosen && store.settings.showAttendance ? [VIEWER_ID, ...event.attendees] : event.attendees;

  function showLocations() {
    document.getElementById("locations")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // Arriving from a "Join a waitlist" button lands on the location choice, not the top.
  useEffect(() => {
    if (focus !== "locations") return;
    const timer = window.setTimeout(showLocations, 60);
    return () => window.clearTimeout(timer);
  }, [focus]);

  function removeRegistration() {
    store.cancelRegistration(event.id);
    app.notify("Removed from your events. If you registered on Luma, cancel there too.");
  }

  return (
    <main className="sc-page sc-detail-page">
      <button className="sc-back" onClick={() => app.goBack("events")}><Icon name="arrow" size={17}/> Back to events</button>
      <section className="sc-event-hero">
        <div className="sc-event-hero-main">
          <span className="sc-status-line"><i /> {event.chapter} · {event.kind}</span>
          <h1>{event.title}</h1>
          <p>{event.summary}</p>
          <div className="sc-event-detail-facts">
            <div><Icon name="calendar"/><span><strong>{event.dateLabel}</strong><em>{event.time} · {event.price}</em></span></div>
            <div><Icon name="pin"/><span><strong>{locationLabel(event.sessions.length)}</strong><em>{event.sessions.map((session) => session.neighborhood).join(" · ")}</em></span></div>
          </div>
          <div className="sc-featured-actions">
            <EventCta event={event} className="sc-primary-button" onChoose={showLocations} />
            <button className="sc-quiet-button" onClick={() => app.navigate("discussion")}><Icon name="message" size={17}/> Join the discussion</button>
          </div>
        </div>
        <div className="sc-event-host-card">
          <span>Hosted by</span>
          {(() => { const host = people.find((person) => person.name === event.host) || store.person("maya"); return <button onClick={() => app.selectPerson(host.id)}><Avatar person={host} size="lg"/><strong>{host.name}</strong><em>{host.role}</em></button>; })()}
          <p>&ldquo;Bring one example from daily life and one question you don&rsquo;t yet know how to answer.&rdquo;</p>
        </div>
      </section>

      <section className="sc-session-board" id="locations">
        <div className="sc-section-heading">
          <div>
            <h2>{event.sessions.length > 1 ? "Choose a location" : "Location"}</h2>
            <p>{event.past ? "Where this evening took place." : event.sessions.length > 1 ? "The same evening runs at each of these venues. Pick the closest one; each registers on its own Luma page." : "Registration happens on the event's Luma page."}</p>
          </div>
        </div>
        <div className="sc-session-grid">
          {event.sessions.map((session) => {
            const host = people.find((person) => person.name === session.host) || store.person("maya");
            const mine = chosen?.venue === session.venue;
            return (
              <article key={session.venue + session.neighborhood} className={`sc-session-card sc-session-${session.status.toLowerCase().replace(" ", "-")} ${mine ? "is-chosen" : ""}`}>
                <header>
                  <span className="sc-session-status">{session.status}</span>
                  <strong>{session.neighborhood}</strong>
                  <em>{session.venue}</em>
                </header>
                <div className="sc-session-meta">
                  <span>{event.past ? "Took place" : session.status === "Preview" ? "Opens 13 days before, at noon" : session.status === "Open" ? "Spots available" : session.status === "Waitlist" ? "Full, waitlist open" : "Fully booked"}</span>
                  <button onClick={() => app.selectPerson(host.id)}><Avatar person={host} size="sm"/>{host.name.split(" ")[0]}</button>
                </div>
                {mine && <p className="sc-session-yours"><Icon name="check" size={14}/>{signedUpLabel(session.status)} here</p>}
                {!event.past && (
                  <LumaLink event={event} session={session} className="sc-session-action">
                    {mine ? "Open on Luma" : session.status === "Open" ? "Register on Luma" : session.status === "Waitlist" ? "Join waitlist on Luma" : session.status === "Preview" ? "See it on Luma" : "View on Luma"}
                  </LumaLink>
                )}
                {mine && <button className="sc-session-remove" onClick={removeRegistration}>Not going? Remove it</button>}
              </article>
            );
          })}
        </div>
      </section>

      <section className="sc-detail-columns">
        <div className="sc-detail-copy"><h2>What to expect</h2>{event.details.map((paragraph, index) => <p key={index}>{paragraph}</p>)}<div className="sc-topic-chips"><span>{event.kind}</span><span>Open to the public</span><span>{event.price === "Free" ? "Free to attend" : event.price}</span><span>Registration on Luma</span></div></div>
        <aside className="sc-attendee-panel">
          <div className="sc-panel-heading"><h2>Members going</h2><span>{attendees.length} you can see</span></div>
          <div className="sc-attendee-grid">
            {attendees.map((id) => {
              const person = store.person(id);
              return <button key={id} onClick={() => (id === VIEWER_ID ? app.viewOwnProfile() : app.selectPerson(id))}><Avatar person={person}/><span><strong>{person.name}{id === VIEWER_ID ? " (you)" : ""}</strong><em>{person.interests[0] ?? person.role}</em></span></button>;
            })}
          </div>
          <p><Icon name="shield" size={16}/> Only members who choose to show their attendance appear here.{chosen && !store.settings.showAttendance ? " You're hidden." : ""}</p>
        </aside>
      </section>

      <section className="sc-event-care-strip">
        <div>
          <Icon name="shield" size={22}/>
          <div>
            <strong>Organizers are at every location</strong>
            <p>If a conversation becomes uncomfortable, you can be moved to another group quietly — no reason required and nobody is named.</p>
          </div>
        </div>
        <button className="sc-quiet-button" onClick={() => app.navigate("messages")}>Tell an organizer <Icon name="chevron" size={15}/></button>
      </section>
      <section className="sc-event-discussion-preview"><div><span className="sc-status-line"><i/> Discussion open</span><h2>Keep the conversation going</h2><p>Members share questions before the evening and pick threads back up afterward.</p></div><div><AvatarStack ids={["amara", "julian", "maya"]}/><span>{event.replies} replies</span><button className="sc-primary-button" onClick={() => app.navigate("discussion")}>Open the discussion <Icon name="chevron" size={16}/></button></div></section>
    </main>
  );
}

/* ------------------------------------------------------------------ */
/* Forum                                                               */
/* ------------------------------------------------------------------ */

function DemoComment({ comment, onReply, depth = 0 }: { comment: ForumComment; onReply: (name: string) => void; depth?: number }) {
  const store = useShowcase();
  const app = useApp();
  const author = store.person(comment.author);
  const isSelf = comment.author === VIEWER_ID;
  return (
    <div className={depth > 0 ? "sc-comment nested" : "sc-comment"}>
      <Avatar person={author} size="sm"/>
      <div>
        <header>
          <button onClick={() => (isSelf ? app.viewOwnProfile() : app.selectPerson(author.id))}>{author.name}{isSelf ? " (you)" : ""}</button>
          <span>{comment.age}</span>
        </header>
        <p>{comment.body}</p>
        <footer>
          <span><Icon name="heart" size={13}/>{comment.likes}</span>
          {!isSelf && <button className="sc-comment-reply" onClick={() => onReply(author.name.split(" ")[0])}>Reply</button>}
        </footer>
        {comment.replies?.map((reply) => <DemoComment key={reply.id} comment={reply} onReply={onReply} depth={depth + 1} />)}
      </div>
    </div>
  );
}

const API_FORUM_PAGE_SIZE = 20;

function forumPerson(user: PublicUser): Person {
  const initials = user.displayName
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0] ?? "")
    .join("")
    .toUpperCase() || "?";
  const colors = ["ink", "clay", "blue", "gold", "green", "violet", "rose"];
  const colorIndex = [...user.id].reduce((sum, character) => sum + character.charCodeAt(0), 0) % colors.length;
  return {
    id: user.id,
    name: user.displayName,
    initials,
    role: user.role === "admin" ? "Organizer" : user.isSocietyMember ? "Society member" : user.isSupporter ? "Forum supporter" : "Participant",
    location: "",
    chapter: "",
    interests: [],
    bio: user.bio ?? "",
    color: colors[colorIndex],
    events: 0,
    mutual: 0,
  };
}

function forumAge(value: string) {
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return "Recently";
  const seconds = Math.max(0, Math.round((Date.now() - time) / 1000));
  if (seconds < 60) return "Just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return days < 7 ? `${days}d` : new Date(time).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function RealReply({ post, depth, onReply }: { post: Post; depth: number; onReply: (post: Post) => void }) {
  const author = forumPerson(post.author);
  return (
    <div className={depth > 0 ? "sc-comment nested" : "sc-comment"} style={{ marginLeft: `${Math.min(depth, 3) * 24}px` }}>
      <Avatar person={author} size="sm"/>
      <div>
        <header><span>{post.deleted ? "Deleted member" : author.name}</span><span>{forumAge(post.createdAt)}</span></header>
        <p>{post.deleted ? "[deleted]" : post.body}</p>
        {!post.deleted && (
          <footer>
            <span><Icon name="heart" size={13}/>{post.likeCount}</span>
            <button className="sc-comment-reply" onClick={() => onReply(post)}>Reply</button>
          </footer>
        )}
      </div>
    </div>
  );
}

function RealForumView({ initialThread }: { initialThread: string | null }) {
  const app = useApp();
  const { token, user } = useAuth();
  const [sort, setSort] = useState<"hot" | "new">("new");
  const [tag, setTag] = useState("");
  const [tags, setTags] = useState<TagWithCount[]>([]);
  const [chapters, setChapters] = useState<ChapterSummary[]>([]);
  const [chapterSlug, setChapterSlug] = useState("");
  const [chapterError, setChapterError] = useState("");
  const [joiningChapter, setJoiningChapter] = useState(false);
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [openThread, setOpenThread] = useState<string | null>(initialThread);
  const [details, setDetails] = useState<Record<string, ThreadDetail>>({});
  const [detailLoading, setDetailLoading] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<Record<string, string>>({});
  const [loadingReplies, setLoadingReplies] = useState(false);
  const [draft, setDraft] = useState("");
  const [replyParent, setReplyParent] = useState<{ id: string; name: string } | null>(null);
  const [replying, setReplying] = useState(false);
  const [pendingLikes, setPendingLikes] = useState<Set<string>>(() => new Set());
  const replyInput = useRef<HTMLInputElement>(null);
  const detailRequest = useRef<AbortController | null>(null);
  const pageRequest = useRef<AbortController | null>(null);
  const pendingLikeIds = useRef(new Set<string>());
  const loadingMoreRef = useRef(false);
  const loadingRepliesRef = useRef(false);
  const replyingRef = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    forumApi.tags({ signal: controller.signal }).then(setTags).catch(() => {});
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!token || !(user?.isSupporter || user?.role === "admin")) {
      setChapters([]);
      setChapterSlug("");
      return;
    }
    const controller = new AbortController();
    forumApi.chapters(token, { signal: controller.signal })
      .then(setChapters)
      .catch((failure) => {
        const message = forumFailureMessage(failure, "load chapters");
        if (message) setChapterError(message);
      });
    return () => controller.abort();
  }, [token, user?.isSupporter, user?.role]);

  const selectedChapter = chapters.find((chapter) => chapter.slug === chapterSlug) ?? null;

  async function requestChapterJoin(chapter: ChapterSummary) {
    if (!token || joiningChapter) return;
    setJoiningChapter(true);
    setChapterError("");
    try {
      const state = await forumApi.requestChapterJoin(chapter.slug, token);
      setChapters((current) => current.map((item) => item.slug === chapter.slug ? { ...item, myMembership: state } : item));
      app.notify(state === "active" ? "Chapter access is active" : "Request sent. An organizer will review it.");
    } catch (failure) {
      setChapterError(forumFailureMessage(failure, "request chapter access"));
    } finally {
      setJoiningChapter(false);
    }
  }

  useEffect(() => {
    pageRequest.current?.abort();
    const controller = new AbortController();
    pageRequest.current = controller;
    setLoading(true);
    setLoadingMore(false);
    setError("");
    if (selectedChapter && selectedChapter.myMembership !== "active" && user?.role !== "admin") {
      setThreads([]);
      setHasMore(false);
      setLoading(false);
      return () => controller.abort();
    }
    forumApi.feed({ sort, tag: tag || undefined, chapterSlug: chapterSlug || undefined, limit: API_FORUM_PAGE_SIZE, offset: 0 }, token, { signal: controller.signal })
      .then((result) => {
        setThreads(result.threads);
        setHasMore(result.hasMore);
      })
      .catch((failure) => {
        const message = forumFailureMessage(failure);
        if (message) setError(message);
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [chapterSlug, reloadKey, sort, tag, token, selectedChapter?.myMembership, user?.role]);

  const loadDetail = useCallback(async (id: string) => {
    detailRequest.current?.abort();
    const controller = new AbortController();
    detailRequest.current = controller;
    setDetailLoading(id);
    setDetailError((current) => ({ ...current, [id]: "" }));
    try {
      const detail = await forumApi.detail(id, token, { signal: controller.signal });
      setDetails((current) => ({ ...current, [id]: detail }));
    } catch (failure) {
      const message = forumFailureMessage(failure, "open that discussion");
      if (message) setDetailError((current) => ({ ...current, [id]: message }));
    } finally {
      if (!controller.signal.aborted) setDetailLoading((current) => current === id ? null : current);
    }
  }, [token]);

  useEffect(() => () => {
    detailRequest.current?.abort();
    pageRequest.current?.abort();
  }, []);

  useEffect(() => {
    if (!initialThread) return;
    setOpenThread(initialThread);
    void loadDetail(initialThread);
  }, [initialThread, loadDetail]);

  async function loadMore() {
    if (loadingMoreRef.current) return;
    loadingMoreRef.current = true;
    pageRequest.current?.abort();
    const controller = new AbortController();
    pageRequest.current = controller;
    setLoadingMore(true);
    setError("");
    try {
      const result = await forumApi.feed(
        { sort, tag: tag || undefined, chapterSlug: chapterSlug || undefined, limit: API_FORUM_PAGE_SIZE, offset: threads.length },
        token,
        { signal: controller.signal },
      );
      setThreads((current) => {
        const existing = new Set(current.map((thread) => thread.id));
        return [...current, ...result.threads.filter((thread) => !existing.has(thread.id))];
      });
      setHasMore(result.hasMore);
    } catch (failure) {
      const message = forumFailureMessage(failure);
      if (message) setError(message);
    } finally {
      loadingMoreRef.current = false;
      if (!controller.signal.aborted) setLoadingMore(false);
    }
  }

  function toggleThread(id: string) {
    if (openThread === id) {
      setOpenThread(null);
      setDraft("");
      setReplyParent(null);
      return;
    }
    setOpenThread(id);
    setDraft("");
    setReplyParent(null);
    void loadDetail(id);
  }

  async function toggleLike(thread: ThreadSummary) {
    if (!token || !user?.canWrite || pendingLikeIds.current.has(thread.id)) return;
    pendingLikeIds.current.add(thread.id);
    setPendingLikes((current) => new Set(current).add(thread.id));
    const optimistic = optimisticThreadLike(thread);
    setThreads((current) => current.map((item) => item.id === thread.id ? optimistic : item));
    try {
      const liked = await forumApi.toggleThreadLike(thread.id, token);
      setThreads((current) => current.map((item) => item.id === thread.id
        ? { ...item, myLiked: liked, likeCount: Math.max(0, thread.likeCount + (liked === thread.myLiked ? 0 : liked ? 1 : -1)) }
        : item));
    } catch (failure) {
      // A dropped write response is ambiguous. Read the canonical state instead
      // of replaying a toggle that may already have committed.
      try {
        const canonical = await forumApi.detail(thread.id, token);
        setDetails((current) => ({ ...current, [thread.id]: canonical }));
        setThreads((current) => current.map((item) => item.id === thread.id
          ? { ...item, myLiked: canonical.myLiked, likeCount: canonical.likeCount }
          : item));
      } catch {
        setThreads((current) => current.map((item) => item.id === thread.id ? thread : item));
      }
      app.notify(forumFailureMessage(failure, "confirm that reaction") || "Reaction was not changed.");
    } finally {
      pendingLikeIds.current.delete(thread.id);
      setPendingLikes((current) => {
        const next = new Set(current);
        next.delete(thread.id);
        return next;
      });
    }
  }

  function focusReply(post: Post) {
    setReplyParent({ id: post.id, name: post.author.displayName.split(" ")[0] || post.author.displayName });
    if (!draft.trim()) setDraft(`@${post.author.displayName.split(" ")[0] || post.author.displayName} `);
    window.setTimeout(() => replyInput.current?.focus(), 0);
  }

  async function loadMoreReplies(detail: ThreadDetail) {
    if (loadingRepliesRef.current) return;
    loadingRepliesRef.current = true;
    setLoadingReplies(true);
    setDetailError((current) => ({ ...current, [detail.id]: "" }));
    try {
      const next = await forumApi.detail(
        detail.id,
        token,
        undefined,
        { limit: detail.repliesLimit, offset: detail.repliesOffset + detail.repliesLimit },
      );
      setDetails((current) => {
        const seen = new Set(detail.posts.map((post) => post.id));
        return {
          ...current,
          [detail.id]: { ...next, posts: [...detail.posts, ...next.posts.filter((post) => !seen.has(post.id))] },
        };
      });
    } catch (failure) {
      setDetailError((current) => ({ ...current, [detail.id]: forumFailureMessage(failure, "load more replies") }));
    } finally {
      loadingRepliesRef.current = false;
      setLoadingReplies(false);
    }
  }

  async function submitReply(event: FormEvent, threadId: string) {
    event.preventDefault();
    if (!token || !draft.trim() || replyingRef.current) return;
    replyingRef.current = true;
    setReplying(true);
    setDetailError((current) => ({ ...current, [threadId]: "" }));
    try {
      await forumApi.createReply({ threadId, body: draft.trim(), parentId: replyParent?.id ?? null }, token);
      const detail = await forumApi.detail(threadId, token);
      setDetails((current) => ({ ...current, [threadId]: detail }));
      setThreads((current) => current.map((item) => item.id === threadId ? { ...item, postCount: detail.postCount } : item));
      setDraft("");
      setReplyParent(null);
      app.notify("Your reply was posted");
    } catch (failure) {
      setDetailError((current) => ({ ...current, [threadId]: forumFailureMessage(failure, "post your reply") }));
    } finally {
      replyingRef.current = false;
      setReplying(false);
    }
  }

  return (
    <main className="sc-page sc-forum-page">
      <section className="sc-page-intro sc-forum-intro">
        <div><h1>Forum</h1><p>Questions, arguments, and unfinished thoughts from across the community.</p></div>
        <button className="sc-primary-button" disabled={!user?.canWrite || (selectedChapter !== null && selectedChapter.myMembership !== "active" && user?.role !== "admin")} onClick={() => app.compose({ chapter: chapterSlug || undefined })}><Icon name="plus" size={17}/> Start a discussion</button>
      </section>
      <div className="sc-forum-scope">
        <div className="sc-filter-set" role="group" aria-label="Discussion scope">
          <span>Scope</span>
          <div className="sc-filter-row">
            <button className={!chapterSlug ? "active" : ""} aria-pressed={!chapterSlug} onClick={() => { setChapterSlug(""); setTag(""); }}>Community-wide</button>
            {chapters.map((chapter) => (
              <button key={chapter.id} className={chapterSlug === chapter.slug ? "active" : ""} aria-pressed={chapterSlug === chapter.slug} onClick={() => { setChapterSlug(chapter.slug); setTag(""); }}>{chapter.name}{chapter.myMembership === "pending" ? " · pending" : ""}</button>
            ))}
          </div>
        </div>
        {chapterError && <p className="sc-field-error" role="alert">{chapterError}</p>}
        {selectedChapter && selectedChapter.myMembership !== "active" && user?.role !== "admin" && (
          <div className="sc-chapter-door">
            <strong>{selectedChapter.name} is a private chapter.</strong>
            <p>{selectedChapter.description || "An organizer approves chapter access before its discussions are visible."}</p>
            {selectedChapter.myMembership === "pending" ? <span>Request pending</span> : <button className="sc-quiet-button" disabled={joiningChapter} onClick={() => void requestChapterJoin(selectedChapter)}>{joiningChapter ? "Requesting…" : "Request to join"}</button>}
          </div>
        )}
        {!user?.isSupporter && user?.role !== "admin" && <p className="sc-forum-membership-note">Chapters require forum supporter access and organizer approval. <a href="/membership">Learn about access</a></p>}
      </div>
      <div className="sc-forum-toolbar">
        <div className="sc-topic-tabs" role="group" aria-label="Filter forum by topic">
          <button className={!tag ? "active" : ""} onClick={() => setTag("")}>All topics</button>
          {!chapterSlug && tags.map((item) => <button key={item.id} className={tag === item.slug ? "active" : ""} onClick={() => setTag(item.slug)}>{item.name}</button>)}
        </div>
        <div className="sc-sort-control" role="group" aria-label="Sort discussions">
          <button className={sort === "new" ? "active" : ""} onClick={() => setSort("new")}>Newest</button>
          <button className={sort === "hot" ? "active" : ""} onClick={() => setSort("hot")}>Popular</button>
        </div>
      </div>
      <section className="sc-forum-layout">
        <div className="sc-thread-list">
          {loading && <div className="sc-empty-state" role="status"><h2>Loading discussions…</h2><p>Connecting to the forum.</p></div>}
          {!loading && error && <div className="sc-empty-state" role="alert"><h2>We couldn’t load the forum</h2><p>{error}</p><button className="sc-quiet-button" onClick={() => setReloadKey((value) => value + 1)}>Try again</button></div>}
          {!loading && !error && threads.map((thread) => {
            const author = forumPerson(thread.author);
            const expanded = openThread === thread.id;
            const detail = details[thread.id];
            const rows = detail ? orderReplyRows(detail.posts) : [];
            return (
              <article id={`thread-${thread.id}`} className={expanded ? "sc-forum-thread expanded" : "sc-forum-thread"} key={thread.id}>
                <button className={`sc-thread-vote ${thread.myLiked ? "liked" : ""}`} disabled={!user?.canWrite || pendingLikes.has(thread.id)} onClick={() => void toggleLike(thread)} aria-pressed={thread.myLiked} aria-label={`${thread.myLiked ? "Unlike" : "Like"} ${thread.title}`}>
                  <Icon name="heart" size={16}/><strong>{thread.likeCount}</strong>
                </button>
                <div className="sc-thread-copy">
                  <span>{thread.chapter?.name ?? "Community"}{thread.topicLabel ? ` · ${thread.topicLabel}` : thread.tags[0] ? ` · ${thread.tags[0].name}` : ""}{thread.locked ? " · Locked" : ""}</span>
                  <button onClick={() => toggleThread(thread.id)} aria-expanded={expanded} aria-controls={`thread-body-${thread.id}`}>{thread.title}</button>
                  <footer>
                    <span><Avatar person={author} size="sm"/>{author.name}</span><span>{forumAge(thread.createdAt)}</span>
                    <button className="sc-thread-toggle" onClick={() => toggleThread(thread.id)} aria-expanded={expanded} aria-controls={`thread-body-${thread.id}`}><Icon name="message" size={14}/>{thread.postCount} {thread.postCount === 1 ? "reply" : "replies"}<em>{expanded ? "Hide" : "Read"}</em></button>
                  </footer>
                  {expanded && (
                    <div className="sc-thread-detail" id={`thread-body-${thread.id}`}>
                      {detailLoading === thread.id && !detail && <div className="sc-thread-body" role="status"><p>Loading discussion…</p></div>}
                      {detailError[thread.id] && !detail && <div className="sc-thread-body" role="alert"><p>{detailError[thread.id]}</p><button className="sc-quiet-button" onClick={() => void loadDetail(thread.id)}>Try again</button></div>}
                      {detail && <>
                        <div className="sc-thread-body">{detail.body.split(/\n{2,}/).map((paragraph, index) => <p key={index}>{paragraph}</p>)}</div>
                        <div className="sc-thread-comments">
                          <h3>{rows.length === 0 ? "No replies yet" : `${detail.postCount} ${detail.postCount === 1 ? "reply" : "replies"}`}</h3>
                          {rows.map(({ post, depth }) => <RealReply key={post.id} post={post} depth={depth} onReply={focusReply}/>)}
                          {detail.hasMoreReplies && <button className="sc-quiet-button sc-api-load-more" disabled={loadingReplies} onClick={() => void loadMoreReplies(detail)}>{loadingReplies ? "Loading…" : "Load more replies"}</button>}
                          {user?.canWrite && !detail.locked && (
                            <form className="sc-comment-composer" onSubmit={(formEvent) => void submitReply(formEvent, thread.id)}>
                              <Avatar person={forumPerson(user)} size="sm"/>
                              <div className="sc-api-reply-field">
                                {replyParent && <span>Replying to {replyParent.name} <button type="button" onClick={() => setReplyParent(null)}>Cancel</button></span>}
                                <input ref={replyInput} value={draft} onChange={(changeEvent) => setDraft(changeEvent.target.value)} placeholder="Add to this conversation…" aria-label="Write a reply"/>
                              </div>
                              <button type="submit" className="sc-primary-button" disabled={!draft.trim() || replying}>{replying ? "Posting…" : "Reply"}</button>
                            </form>
                          )}
                          {detailError[thread.id] && <p className="sc-field-error" role="alert">{detailError[thread.id]}</p>}
                        </div>
                      </>}
                    </div>
                  )}
                </div>
              </article>
            );
          })}
          {!loading && !error && threads.length === 0 && (!selectedChapter || selectedChapter.myMembership === "active" || user?.role === "admin") && <div className="sc-empty-state"><Icon name="message" size={28}/><h2>No discussions yet</h2><p>Start the first question for {selectedChapter?.name ?? "the community"}.</p><button className="sc-quiet-button" disabled={!user?.canWrite} onClick={() => app.compose({ chapter: chapterSlug || undefined })}>Start one</button></div>}
          {!loading && !error && hasMore && <button className="sc-quiet-button sc-api-load-more" disabled={loadingMore} onClick={() => void loadMore()}>{loadingMore ? "Loading…" : "Load more discussions"}</button>}
        </div>
        <aside className="sc-forum-aside">
          {!chapterSlug && <div><h2>Topics people are following</h2>{tags.slice(0, 6).map((item) => <button key={item.id} className={tag === item.slug ? "active" : ""} onClick={() => setTag(item.slug)}><span>{item.name}</span><em>{item.threadCount} discussions</em><Icon name="chevron" size={15}/></button>)}</div>}
          <div className="sc-forum-prompt"><Icon name="spark" size={24}/><h2>A good question makes space.</h2><p>Share what you are still working out. Curiosity is more useful here than certainty.</p><button onClick={() => app.navigate("guidelines")}>Read discussion guidelines</button></div>
        </aside>
      </section>
    </main>
  );
}

function ForumView({ initialThread }: { initialThread: string | null }) {
  const store = useShowcase();
  const [showSample, setShowSample] = useState(SHOWCASE_REVIEW_MODE);
  if (store.account?.email !== DEMO_EMAIL) return <RealForumView initialThread={initialThread}/>;
  if (SHOWCASE_REVIEW_MODE) return <DemoForumView initialThread={initialThread}/>;
  return <>
    <div className="sc-demo-switch"><span>{showSample ? "Sample discussion data — not the live forum" : "Live public forum — sign in with an account to participate"}</span><button type="button" onClick={() => setShowSample((current) => !current)}>{showSample ? "Show live forum" : "Explore sample discussions"}</button></div>
    {showSample ? <DemoForumView initialThread={initialThread}/> : <RealForumView initialThread={initialThread}/>}
  </>;
}

function DemoForumView({ initialThread }: { initialThread: string | null }) {
  const store = useShowcase();
  const app = useApp();
  const topics = ["All topics", ...THREAD_TOPICS];
  const [topic, setTopic] = useState("All topics");
  const [chapter, setChapter] = useState("All chapters");
  const [locationId, setLocationId] = useState<string | null>(null);
  const activeChapter = chapters.find((item) => item.name === chapter) ?? null;
  const activeLocation = locationName(chapter, locationId);
  const [sort, setSort] = useState<"Popular" | "Newest">("Newest");
  const [openThread, setOpenThread] = useState<string | null>(initialThread);
  const [draft, setDraft] = useState("");
  const replyInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!initialThread) return;
    setOpenThread(initialThread);
    window.setTimeout(() => document.getElementById(`thread-${initialThread}`)?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
  }, [initialThread]);

  const allThreads = useMemo(() => [...store.userThreads, ...forumThreads], [store.userThreads]);

  const visibleThreads = useMemo(() => {
    const filtered = allThreads.filter((thread) =>
      (topic === "All topics" || thread.topic === topic) &&
      (chapter === "All chapters" || thread.chapter === chapter) &&
      (!locationId || thread.location === locationId));
    return [...filtered].sort((a, b) => {
      const likesA = a.likes + (store.likedThreads.includes(a.id) ? 1 : 0);
      const likesB = b.likes + (store.likedThreads.includes(b.id) ? 1 : 0);
      return sort === "Popular" ? likesB - likesA : allThreads.indexOf(a) - allThreads.indexOf(b);
    });
  }, [topic, chapter, locationId, sort, allThreads, store.likedThreads]);

  function selectChapter(name: string) {
    setChapter(name);
    setLocationId(null);
  }

  // Where a new discussion should live, carried over from whatever the member is browsing.
  const composeScope = { chapter: activeChapter ? chapter : undefined, location: locationId };
  const scopeLabel = activeLocation ? `${chapter} · ${activeLocation}` : activeChapter ? chapter : null;

  function toggleThread(id: string) {
    setOpenThread((current) => (current === id ? null : id));
    setDraft("");
  }

  function focusReply(name: string) {
    setDraft(`@${name} `);
    window.setTimeout(() => replyInput.current?.focus(), 0);
  }

  function submitReply(event: FormEvent, threadId: string) {
    event.preventDefault();
    if (!draft.trim()) return;
    store.replyToThread(threadId, draft);
    setDraft("");
    app.notify("Your reply was posted");
  }

  return (
    <main className="sc-page sc-forum-page">
      <section className="sc-page-intro sc-forum-intro">
        <div>
          <h1>Forum</h1>
          <p>Questions, arguments, and unfinished thoughts from across the community.</p>
        </div>
        <button className="sc-primary-button" onClick={() => app.compose(composeScope)}><Icon name="plus" size={17}/> Start a discussion</button>
      </section>
      <div className="sc-forum-scope">
        <div className="sc-filter-set" role="group" aria-label="Filter forum by chapter">
          <span>Chapter</span>
          <div className="sc-filter-row">
            {["All chapters", ...chapters.map((item) => item.name)].map((item) => (
              <button key={item} className={chapter === item ? "active" : ""} aria-pressed={chapter === item} onClick={() => selectChapter(item)}>{item}</button>
            ))}
          </div>
        </div>
        {activeChapter && activeChapter.locations.length > 0 && (
          <div className="sc-filter-set" role="group" aria-label={`Filter ${chapter} discussions by location`}>
            <span>Location</span>
            <div className="sc-filter-row">
              <button className={!locationId ? "active" : ""} aria-pressed={!locationId} onClick={() => setLocationId(null)}>All of {chapter}</button>
              {activeChapter.locations.map((item) => (
                <button key={item.id} className={locationId === item.id ? "active" : ""} aria-pressed={locationId === item.id} title={item.venue} onClick={() => setLocationId(item.id)}>{item.name}</button>
              ))}
            </div>
          </div>
        )}
      </div>
      <div className="sc-forum-toolbar">
        <div className="sc-topic-tabs" role="group" aria-label="Filter forum by topic">
          {topics.map((item) => <button key={item} className={topic === item ? "active" : ""} onClick={() => setTopic(item)}>{item}</button>)}
        </div>
        <div className="sc-sort-control" role="group" aria-label="Sort discussions">
          {(["Newest", "Popular"] as const).map((item) => <button key={item} className={sort === item ? "active" : ""} onClick={() => setSort(item)}>{item}</button>)}
        </div>
      </div>
      <section className="sc-forum-layout">
        <div className="sc-thread-list">
          {visibleThreads.map((thread) => {
            const author = store.person(thread.author);
            const expanded = openThread === thread.id;
            const liked = store.likedThreads.includes(thread.id);
            const extra = store.threadReplies[thread.id] ?? [];
            const comments = [...thread.comments, ...extra];
            const replyCount = thread.replies + extra.length;
            const mine = thread.author === VIEWER_ID;
            const place = locationName(thread.chapter, thread.location);
            return (
              <article id={`thread-${thread.id}`} className={expanded ? "sc-forum-thread expanded" : "sc-forum-thread"} key={thread.id}>
                <button className={`sc-thread-vote ${liked ? "liked" : ""}`} onClick={() => store.toggleThreadLike(thread.id)} aria-pressed={liked} aria-label={`${liked ? "Unlike" : "Like"} ${thread.title}`}>
                  <Icon name="heart" size={16}/>
                  <strong>{thread.likes + (liked ? 1 : 0)}</strong>
                </button>
                <div className="sc-thread-copy">
                  <span>{thread.chapter}{place ? ` · ${place}` : ""} · {thread.topic}{mine ? " · Your discussion" : ""}</span>
                  <button onClick={() => toggleThread(thread.id)} aria-expanded={expanded} aria-controls={`thread-body-${thread.id}`}>{thread.title}</button>
                  {!expanded && <p>{thread.excerpt}</p>}
                  <footer>
                    <button onClick={() => (mine ? app.viewOwnProfile() : app.selectPerson(author.id))}><Avatar person={author} size="sm"/>{author.name}</button>
                    <span>{thread.age}</span>
                    <button className="sc-thread-toggle" onClick={() => toggleThread(thread.id)} aria-expanded={expanded} aria-controls={`thread-body-${thread.id}`}>
                      <Icon name="message" size={14}/>{replyCount} {replyCount === 1 ? "reply" : "replies"}
                      <em>{expanded ? "Hide" : "Read"}</em>
                    </button>
                  </footer>
                  {expanded && (
                    <div className="sc-thread-detail" id={`thread-body-${thread.id}`}>
                      <div className="sc-thread-body">
                        {thread.body.map((paragraph, index) => <p key={index}>{paragraph}</p>)}
                      </div>
                      <div className="sc-thread-comments">
                        <h3>{comments.length === 0 ? "No replies yet" : `${comments.length} of ${replyCount} replies`}</h3>
                        {comments.map((comment) => <DemoComment key={comment.id} comment={comment} onReply={focusReply} />)}
                        <form className="sc-comment-composer" onSubmit={(formEvent) => submitReply(formEvent, thread.id)}>
                          <Avatar person={store.viewer} size="sm"/>
                          <input ref={replyInput} value={draft} onChange={(changeEvent) => setDraft(changeEvent.target.value)} placeholder="Add to this conversation…" aria-label="Write a reply"/>
                          <button type="submit" className="sc-primary-button" disabled={!draft.trim()}>Reply</button>
                        </form>
                      </div>
                    </div>
                  )}
                </div>
              </article>
            );
          })}
          {visibleThreads.length === 0 && (
            <div className="sc-empty-state">
              <Icon name="message" size={28}/>
              <h2>No {topic === "All topics" ? "" : `${topic} `}discussions{scopeLabel ? ` in ${scopeLabel}` : ""} yet</h2>
              <p>{scopeLabel ? `Start the first question for ${scopeLabel}.` : "Start the first question for the community."}</p>
              <button className="sc-quiet-button" onClick={() => app.compose({ ...composeScope, topic: topic === "All topics" ? undefined : topic })}>Start one</button>
            </div>
          )}
        </div>
        <aside className="sc-forum-aside">
          <div><h2>Topics people are following</h2>{THREAD_TOPICS.slice(0, 4).map((item, index) => <button key={item} className={topic === item ? "active" : ""} onClick={() => setTopic(item)}><span>{item}</span><em>{[86,64,51,38][index]} followers</em><Icon name="chevron" size={15}/></button>)}</div>
          <div className="sc-forum-prompt"><Icon name="spark" size={24}/><h2>A good question makes space.</h2><p>Share what you are still working out. Curiosity is more useful here than certainty.</p><button onClick={() => app.navigate("guidelines")}>Read discussion guidelines</button></div>
        </aside>
      </section>
    </main>
  );
}

function RealComposeView({ preset }: { preset: ComposePreset }) {
  const app = useApp();
  const { token, user } = useAuth();
  const [tags, setTags] = useState<TagWithCount[]>([]);
  const [chapters, setChapters] = useState<ChapterSummary[]>([]);
  const [chapterSlug, setChapterSlug] = useState(preset.chapter ?? "");
  const [tagId, setTagId] = useState("");
  const [topicLabel, setTopicLabel] = useState(preset.topic && !THREAD_TOPICS.includes(preset.topic) ? preset.topic : "");
  const [title, setTitle] = useState(preset.title ?? "");
  const [body, setBody] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [guidelinesOpen, setGuidelinesOpen] = useState(false);
  const submittingRef = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    forumApi.tags({ signal: controller.signal })
      .then((items) => {
        setTags(items);
        const presetTag = items.find((item) => item.name === preset.topic);
        if (presetTag) setTagId(presetTag.id);
      })
      .catch((failure) => {
        const message = forumFailureMessage(failure, "load discussion topics");
        if (message) setError(message);
      });
    return () => controller.abort();
  }, [preset.topic]);

  useEffect(() => {
    if (!token || !(user?.isSupporter || user?.role === "admin")) return;
    const controller = new AbortController();
    forumApi.chapters(token, { signal: controller.signal })
      .then((items) => {
        setChapters(items.filter((item) => item.myMembership === "active" || user?.role === "admin"));
      })
      .catch((failure) => {
        const message = forumFailureMessage(failure, "load your chapters");
        if (message) setError(message);
      });
    return () => controller.abort();
  }, [token, user?.isSupporter, user?.role]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!token || submittingRef.current) return;
    if (title.trim().length < 8) { setError("Give the question a title of at least a few words."); return; }
    if (body.trim().length < 20) { setError("Add a little context so people know where to start."); return; }
    if (topicLabel.trim().length === 1) { setError("Give your topic at least two characters, or leave it blank."); return; }
    if (!user?.canWrite) { setError("Your account cannot post discussions right now."); return; }
    const selectedChapter = chapters.find((chapter) => chapter.slug === chapterSlug);
    if (chapterSlug && !selectedChapter) { setError("Chapter access changed. Choose an active chapter or the community-wide forum."); return; }
    submittingRef.current = true;
    setSubmitting(true);
    setError("");
    try {
      const id = await forumApi.createThread({
        title: title.trim(),
        body: body.trim(),
        topicLabel: topicLabel.trim() || undefined,
        tagIds: tagId ? [tagId] : [],
        chapterId: selectedChapter?.id ?? null,
      }, token);
      app.notify("Your discussion is live");
      app.openThread(id);
    } catch (failure) {
      // Keep every field intact. A timed-out create is ambiguous and must not
      // be replayed automatically; the transport message tells the member to
      // check the feed before trying again.
      setError(forumFailureMessage(failure, "post your discussion"));
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  return (
    <main className="sc-page sc-compose-page">
      <button className="sc-back" onClick={() => app.goBack("forum")}><Icon name="arrow" size={17}/> Back to forum</button>
      <section className="sc-compose">
        <h1>Start a discussion</h1>
        <p className="sc-compose-lede">Ask what you are still working out. The best threads here start with a genuine question, not a finished argument.</p>
        <div className="sc-compose-layout">
        <form onSubmit={(event) => void submit(event)} className="sc-compose-form">
          <div className="sc-input-field"><span>Scope</span><div className="sc-filter-row">
            <button type="button" className={!chapterSlug ? "active" : ""} aria-pressed={!chapterSlug} onClick={() => setChapterSlug("")}>Community-wide forum</button>
            {chapters.map((chapter) => <button type="button" key={chapter.id} className={chapterSlug === chapter.slug ? "active" : ""} aria-pressed={chapterSlug === chapter.slug} onClick={() => setChapterSlug(chapter.slug)}>{chapter.name}</button>)}
          </div></div>
          <div className="sc-input-field">
            <span>Browse topic <small>Optional</small></span>
            <div className="sc-filter-row">
              <button type="button" className={!tagId ? "active" : ""} onClick={() => setTagId("")}>No topic</button>
              {tags.map((item) => <button type="button" key={item.id} className={tagId === item.id ? "active" : ""} onClick={() => setTagId(item.id)}>{item.name}</button>)}
            </div>
            <small>Choose a shared topic to help others find this discussion.</small>
          </div>
          <label className="sc-input-field">
            <span>Describe your topic <small>Optional</small></span>
            <input value={topicLabel} onChange={(event) => setTopicLabel(event.target.value)} placeholder="e.g. Moral luck and responsibility" maxLength={80}/>
            <small>Your own words appear on the discussion; they do not create a site-wide filter.</small>
          </label>
          <label className="sc-input-field">
            <span>Your question <small>The short title people will see in the feed</small></span>
            <input value={title} onChange={(event) => { setTitle(event.target.value); setError(""); }} placeholder="Is it possible to want something you believe is bad for you?" maxLength={200}/>
            <small>{title.length}/200</small>
          </label>
          <label className="sc-input-field">
            <span>Context <small>Background, examples, and what you have considered</small></span>
            <textarea value={body} onChange={(event) => { setBody(event.target.value); setError(""); }} placeholder="Where did this come from? What have you ruled out? Leave a blank line between paragraphs." rows={8} maxLength={20000}/>
          </label>
          {error && <p className="sc-field-error" role="alert">{error}</p>}
          <div className="sc-compose-actions">
            <button type="button" className="sc-text-link" aria-expanded={guidelinesOpen} aria-controls="sc-compose-guidance" onClick={() => setGuidelinesOpen((open) => !open)}>{guidelinesOpen ? "Back to draft" : "Discussion guidelines"}</button>
            <button type="button" className="sc-quiet-button" onClick={() => app.goBack("forum")}>Cancel</button>
            <button type="submit" className="sc-primary-button" disabled={submitting || !user?.canWrite}>{submitting ? "Posting…" : "Post discussion"}</button>
          </div>
        </form>
        <ComposeGuidance expanded={guidelinesOpen} onClose={() => setGuidelinesOpen(false)}/>
        </div>
      </section>
    </main>
  );
}

function ComposeView({ preset }: { preset: ComposePreset }) {
  const store = useShowcase();
  return store.account?.email === DEMO_EMAIL
    ? <DemoComposeView preset={preset}/>
    : <RealComposeView preset={preset}/>;
}

function DemoComposeView({ preset }: { preset: ComposePreset }) {
  const store = useShowcase();
  const app = useApp();
  const [topic, setTopic] = useState(preset.topic && THREAD_TOPICS.includes(preset.topic) ? preset.topic : "Ethics");
  const [ownTopic, setOwnTopic] = useState(preset.topic && !THREAD_TOPICS.includes(preset.topic) ? preset.topic : "");
  const startingChapter = chapters.find((item) => item.name === (preset.chapter ?? store.viewer.chapter))?.name ?? chapters[0].name;
  const [chapter, setChapter] = useState(startingChapter);
  const [locationId, setLocationId] = useState<string | null>(preset.chapter === startingChapter ? preset.location ?? null : null);
  const chapterLocations = chapters.find((item) => item.name === chapter)?.locations ?? [];
  const [title, setTitle] = useState(preset.title ?? "");
  const [body, setBody] = useState("");
  const [error, setError] = useState("");
  const [guidelinesOpen, setGuidelinesOpen] = useState(false);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (title.trim().length < 8) { setError("Give the question a title of at least a few words."); return; }
    if (body.trim().length < 20) { setError("Add a little context so people know where to start."); return; }
    if (ownTopic.trim().length === 1) { setError("Give your topic at least two characters, or leave it blank."); return; }
    const id = store.startThread({ topic: ownTopic.trim() || topic, title, body, chapter, location: locationId });
    app.notify("Your discussion is live");
    app.openThread(id);
  }

  return (
    <main className="sc-page sc-compose-page">
      <button className="sc-back" onClick={() => app.goBack("forum")}><Icon name="arrow" size={17}/> Back to forum</button>
      <section className="sc-compose">
        <h1>Start a discussion</h1>
        <p className="sc-compose-lede">Ask what you are still working out. The best threads here start with a genuine question, not a finished argument.</p>
        <div className="sc-compose-layout">
        <form onSubmit={submit} className="sc-compose-form">
          <div className="sc-input-field">
            <span>Chapter</span>
            <div className="sc-filter-row">
              {chapters.map((item) => <button type="button" key={item.name} className={chapter === item.name ? "active" : ""} aria-pressed={chapter === item.name} onClick={() => { setChapter(item.name); setLocationId(null); }}>{item.name}</button>)}
            </div>
          </div>
          {chapterLocations.length > 0 && (
            <div className="sc-input-field">
              <span>Location</span>
              <div className="sc-filter-row">
                <button type="button" className={!locationId ? "active" : ""} aria-pressed={!locationId} onClick={() => setLocationId(null)}>All of {chapter}</button>
                {chapterLocations.map((item) => <button type="button" key={item.id} className={locationId === item.id ? "active" : ""} aria-pressed={locationId === item.id} title={item.venue} onClick={() => setLocationId(item.id)}>{item.name}</button>)}
              </div>
            </div>
          )}
          <div className="sc-input-field">
            <span>Browse topic</span>
            <div className="sc-filter-row">
              {THREAD_TOPICS.map((item) => <button type="button" key={item} className={topic === item ? "active" : ""} onClick={() => setTopic(item)}>{item}</button>)}
            </div>
          </div>
          <label className="sc-input-field">
            <span>Describe your topic <small>Optional</small></span>
            <input value={ownTopic} onChange={(event) => setOwnTopic(event.target.value)} placeholder="e.g. Moral luck and responsibility" maxLength={80}/>
            <small>Use your own words when the listed topics do not quite fit.</small>
          </label>
          <label className="sc-input-field">
            <span>Your question <small>The short title people will see in the feed</small></span>
            <input value={title} onChange={(event) => { setTitle(event.target.value); setError(""); }} placeholder="Is it possible to want something you believe is bad for you?" maxLength={140} />
            <small>{title.length}/140</small>
          </label>
          <label className="sc-input-field">
            <span>Context <small>Background, examples, and what you have considered</small></span>
            <textarea value={body} onChange={(event) => { setBody(event.target.value); setError(""); }} placeholder="Where did this come from? What have you ruled out? Leave a blank line between paragraphs." rows={8} />
          </label>
          {error && <p className="sc-field-error" role="alert">{error}</p>}
          <div className="sc-compose-actions">
            <button type="button" className="sc-text-link" aria-expanded={guidelinesOpen} aria-controls="sc-compose-guidance" onClick={() => setGuidelinesOpen((open) => !open)}>{guidelinesOpen ? "Back to draft" : "Discussion guidelines"}</button>
            <button type="button" className="sc-quiet-button" onClick={() => app.goBack("forum")}>Cancel</button>
            <button type="submit" className="sc-primary-button">Post discussion</button>
          </div>
        </form>
        <ComposeGuidance expanded={guidelinesOpen} onClose={() => setGuidelinesOpen(false)}/>
        </div>
      </section>
    </main>
  );
}

function ComposeGuidance({ expanded, onClose }: { expanded: boolean; onClose: () => void }) {
  return <aside className="sc-compose-guide" id="sc-compose-guidance" aria-label={expanded ? "Discussion guidelines" : "Writing help"}>
    {expanded ? <>
      <h2>Discussion guidelines</h2>
      <ol className="sc-compose-rules">{DISCUSSION_PRINCIPLES.map((item) => <li key={item.title}><strong>{item.title}</strong><p>{item.body}</p></li>)}</ol>
      <button type="button" className="sc-text-link" onClick={onClose}>Back to your draft</button>
    </> : <>
      <span className="sc-compose-guide-eyebrow">A good discussion starts here</span>
      <h2>Leave room for an answer.</h2>
      <p><strong>Question</strong> is the one sentence others will see first.</p>
      <p><strong>Context</strong> explains why you are asking, what you have considered, and where you are still unsure.</p>
      <p>Your draft stays in place when you open the guidelines.</p>
    </>}
  </aside>;
}

function GuidelinesView() {
  const app = useApp();
  return (
    <main className="sc-page sc-guidelines-page">
      <button className="sc-back" onClick={() => app.goBack("forum")}><Icon name="arrow" size={17}/> Back</button>
      <section className="sc-guidelines">
        <h1>How we talk to each other</h1>
        <p className="sc-compose-lede">The club is open to the public. These six commitments are what make that work — at our events and here online.</p>
        <ol>
          {DISCUSSION_PRINCIPLES.map((item) => (
            <li key={item.title}>
              <h2>{item.title}</h2>
              <p>{item.body}</p>
            </li>
          ))}
        </ol>
        <div className="sc-guidelines-foot">
          <Icon name="shield" size={22}/>
          <p>Something felt off? <button className="sc-text-link" onClick={() => app.navigate("messages")}>Tell an organizer</button> — it goes to a person, not an inbox.</p>
        </div>
      </section>
    </main>
  );
}

/* ------------------------------------------------------------------ */
/* Community & profiles                                                */
/* ------------------------------------------------------------------ */

function PeopleView() {
  const store = useShowcase();
  return store.account?.email === DEMO_EMAIL ? <DemoPeopleView/> : <RealPeopleView/>;
}

function RealPeopleView() {
  const { token, user } = useAuth();
  const app = useApp();
  const [query, setQuery] = useState("");
  const [partnersOnly, setPartnersOnly] = useState(false);
  const [entries, setEntries] = useState<DirectoryEntry[]>([]);
  const [chapters, setChapters] = useState<ChapterSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [chapterError, setChapterError] = useState("");
  const [retryKey, setRetryKey] = useState(0);
  const pageRequest = useRef<AbortController | null>(null);
  const loadingMoreRef = useRef(false);
  const hasAccess = Boolean(token && (user?.isSupporter || user?.role === "admin"));

  useEffect(() => {
    if (!hasAccess || !token) { setChapters([]); return; }
    const controller = new AbortController();
    forumApi.chapters(token, { signal: controller.signal })
      .then(setChapters)
      .catch((failure) => {
        const message = forumFailureMessage(failure, "load chapters");
        if (message) setChapterError(message);
      });
    return () => controller.abort();
  }, [hasAccess, token]);

  useEffect(() => {
    pageRequest.current?.abort();
    setEntries([]);
    setHasMore(false);
    setLoadingMore(false);
    if (!hasAccess || !token) { setLoading(false); return; }
    const controller = new AbortController();
    pageRequest.current = controller;
    setLoading(true);
    setError("");
    const timer = window.setTimeout(() => {
      memberApi.directory({ q: query, partners: partnersOnly }, token, { signal: controller.signal })
        .then((result) => {
          if (controller.signal.aborted) return;
          setEntries(result.entries);
          setTotal(result.total);
          setHasMore(result.hasMore);
        })
        .catch((failure) => {
          const message = forumFailureMessage(failure, "load the member directory");
          if (message && !controller.signal.aborted) setError(message);
        })
        .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    }, query ? 250 : 0);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [hasAccess, partnersOnly, query, retryKey, token]);

  async function loadMore() {
    if (!hasAccess || !token || loadingMoreRef.current || !hasMore) return;
    loadingMoreRef.current = true;
    const controller = new AbortController();
    pageRequest.current = controller;
    setLoadingMore(true);
    setError("");
    try {
      const result = await memberApi.directory({ q: query, partners: partnersOnly, offset: entries.length }, token, { signal: controller.signal });
      if (controller.signal.aborted) return;
      setEntries((current) => {
        const seen = new Set(current.map((entry) => entry.user.id));
        return [...current, ...result.entries.filter((entry) => !seen.has(entry.user.id))];
      });
      setHasMore(result.hasMore);
      setTotal(result.total);
    } catch (failure) {
      const message = forumFailureMessage(failure, "load more members");
      if (message && !controller.signal.aborted) setError(message);
    } finally {
      loadingMoreRef.current = false;
      if (!controller.signal.aborted) setLoadingMore(false);
    }
  }

  return <main className="sc-page sc-community-page">
    <section className="sc-page-intro"><div><h1>Community</h1><p>Society chapters and members who chose to be found.</p></div></section>
    {!hasAccess ? <section className="sc-empty-state"><Icon name="chapters" size={28}/><h2>A supporter space</h2><p>Chapters and the opt-in directory require forum supporter access.</p><a className="sc-quiet-button" href="/membership">Explore supporter access</a></section> : <>
      <section className="sc-chapter-band">
        <div className="sc-section-heading"><div><h2>Chapters</h2><p>Organizers approve chapter access separately from forum supporter access.</p></div><button className="sc-text-action" onClick={() => app.navigate("forum")}>Explore discussions <Icon name="chevron" size={15}/></button></div>
        {chapterError && <p className="sc-field-error" role="alert">{chapterError}</p>}
        <div className="sc-chapter-strip">{chapters.map((chapter) => <article className="sc-chapter-tile" key={chapter.id}>
          <header><strong>{chapter.name}</strong><em>{chapter.location || "Online and in person"}</em></header>
          <p>{chapter.description || "A place for local philosophical conversation."}</p>
          <div className="sc-chapter-facts"><span>{chapter.memberCount} {chapter.memberCount === 1 ? "member" : "members"}</span><span>{chapter.myMembership === "active" ? "Joined" : chapter.myMembership === "pending" ? "Request pending" : "Request access in Forum"}</span></div>
        </article>)}</div>
      </section>
      <section className="sc-directory-band">
        <div className="sc-section-heading"><div><h2>Directory</h2><p>Only current members who opted in appear here.</p></div><a className="sc-text-action" href="/settings">Manage your listing <Icon name="chevron" size={15}/></a></div>
        <div className="sc-directory-tools"><label className="sc-search-box"><Icon name="search" size={19}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by name or interests" aria-label="Search the member directory"/></label><button className={partnersOnly ? "sc-quiet-button active" : "sc-quiet-button"} aria-pressed={partnersOnly} onClick={() => setPartnersOnly((value) => !value)}>Open to a reading partner</button></div>
        {loading ? <div className="sc-empty-state" role="status"><h2>Loading members…</h2></div> : error && entries.length === 0 ? <div className="sc-empty-state" role="alert"><h2>We couldn’t load the directory</h2><p>{error}</p><button className="sc-quiet-button" onClick={() => setRetryKey((value) => value + 1)}>Try again</button></div> : <>
          <p className="sc-results-count">{total} {total === 1 ? "member" : "members"}</p>
          <div className="sc-directory-list">{entries.map((entry) => <article className="sc-directory-row" key={entry.user.id}>
            <a className="sc-person-open" href={`/u/${encodeURIComponent(entry.user.id)}`} aria-label={`View ${entry.user.displayName}'s profile`}><Avatar person={forumPerson(entry.user)} size="lg"/></a>
            <div className="sc-directory-identity"><a className="sc-name-button" href={`/u/${encodeURIComponent(entry.user.id)}`}>{entry.user.displayName}</a><p>{entry.directoryBio || "No directory introduction yet"}</p><span>{entry.chapters.map((chapter) => chapter.name).join(" · ") || (entry.user.isSocietyMember ? "Society member" : "Forum supporter")}</span></div>
            <div className="sc-directory-interests">{entry.openToPartners && <span>Open to a reading partner</span>}</div>
            <div className="sc-directory-action"><a className="sc-follow-button" href={`/u/${encodeURIComponent(entry.user.id)}`}>View profile</a></div>
          </article>)}</div>
          {entries.length === 0 && <div className="sc-empty-state"><Icon name="search" size={28}/><h2>No members match yet</h2><p>Try a different name or interest.</p><button className="sc-quiet-button" onClick={() => { setQuery(""); setPartnersOnly(false); }}>Clear filters</button></div>}
          {error && entries.length > 0 && <p className="sc-field-error" role="alert">{error}</p>}
          {hasMore && <button className="sc-quiet-button sc-api-load-more" disabled={loadingMore} onClick={() => void loadMore()}>{loadingMore ? "Loading…" : "Load more members"}</button>}
        </>}
      </section>
    </>}
  </main>;
}

function DemoPeopleView() {
  const store = useShowcase();
  const app = useApp();
  const [query, setQuery] = useState("");
  const [chapter, setChapter] = useState("All chapters");
  const [place, setPlace] = useState("Anywhere");
  const [openOnly, setOpenOnly] = useState(false);

  // You only appear in the directory when you have chosen to be listed.
  const directory = useMemo(() => [
    ...(store.settings.directoryVisible ? [store.viewer] : []),
    ...others,
  ], [store.settings.directoryVisible, store.viewer]);

  const places = useMemo(() => ["Anywhere", ...Array.from(new Set(directory.map((person) => person.location.split(", ")[0])))], [directory]);

  const filtered = useMemo(() => directory.filter((person) => {
    const matchesQuery = `${person.name} ${person.location} ${person.chapter} ${person.interests.join(" ")}`.toLowerCase().includes(query.toLowerCase());
    const matchesChapter = chapter === "All chapters" || person.chapter === chapter;
    const matchesPlace = place === "Anywhere" || person.location.startsWith(place);
    const matchesOpen = !openOnly || person.openToConnect;
    return matchesQuery && matchesChapter && matchesPlace && matchesOpen;
  }), [directory, query, chapter, place, openOnly]);

  function toggleChapter(name: string) {
    const joined = store.toggleChapter(name);
    app.notify(joined ? `Joined ${name}` : `Left ${name}`);
  }

  return (
    <main className="sc-page sc-community-page">
      <section className="sc-page-intro">
        <div>
          <h1>Community</h1>
          <p>Four chapters, and the members who chose to be found.</p>
        </div>
      </section>

      <section className="sc-chapter-band">
        <div className="sc-section-heading">
          <div>
            <h2>Chapters</h2>
            <p>We run free public philosophy events in four cities. Join the one nearest you, then filter the directory to it.</p>
          </div>
        </div>
        <div className="sc-chapter-strip">
          {chapters.map((item) => {
            const joined = store.joinedChapters.includes(item.name);
            return (
              <article className={`sc-chapter-tile sc-chapter-${item.color} ${chapter === item.name ? "selected" : ""}`} key={item.name}>
                <header>
                  <strong>{item.name}</strong>
                  <em>{item.location}</em>
                </header>
                <p>{item.description}</p>
                <div className="sc-chapter-facts">
                  <span>{item.members.toLocaleString()} members</span>
                  <span>{item.cadence}</span>
                </div>
                <div className="sc-chapter-tile-actions">
                  <button className={joined ? "active" : ""} onClick={() => toggleChapter(item.name)}>{joined ? "Joined" : "Join"}</button>
                  <button onClick={() => setChapter(chapter === item.name ? "All chapters" : item.name)}>{chapter === item.name ? "Clear filter" : "Filter directory"}</button>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section className="sc-directory-band">
        <div className="sc-section-heading">
          <div>
            <h2>Directory</h2>
            <p>Members who chose to be listed. Visibility is opt-in and can be turned off at any time.</p>
          </div>
          <button className="sc-text-action" onClick={() => app.openSettings("privacy")}>
            {store.settings.directoryVisible ? "You're listed" : "You're hidden"} · Change <Icon name="chevron" size={15}/>
          </button>
        </div>

        <div className="sc-directory-tools">
          <label className="sc-search-box"><Icon name="search" size={19}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by name, place, or interest"/></label>
          <div className="sc-filter-groups">
            <div className="sc-filter-set" role="group" aria-label="Filter by chapter">
              <span>Chapter</span>
              <div className="sc-filter-row">
                {["All chapters", ...chapters.map((item) => item.name)].map((item) => (
                  <button key={item} className={chapter === item ? "active" : ""} onClick={() => setChapter(item)}>{item}</button>
                ))}
              </div>
            </div>
            <div className="sc-filter-set" role="group" aria-label="Filter by location">
              <span>Location</span>
              <div className="sc-filter-row">
                {places.map((item) => <button key={item} className={place === item ? "active" : ""} onClick={() => setPlace(item)}>{item}</button>)}
                <button className={openOnly ? "active" : ""} onClick={() => setOpenOnly(!openOnly)}>Open to connect</button>
              </div>
            </div>
          </div>
        </div>

        <p className="sc-results-count">{filtered.length} {filtered.length === 1 ? "member" : "members"}{chapter !== "All chapters" ? ` in ${chapter}` : ""}{place !== "Anywhere" ? ` · ${place}` : ""}</p>
        <div className="sc-directory-list">
          {filtered.map((person) => {
            const isSelf = person.id === VIEWER_ID;
            const open = () => (isSelf ? app.viewOwnProfile() : app.selectPerson(person.id));
            return (
              <article className={`sc-directory-row ${isSelf ? "is-self" : ""}`} key={person.id}>
                <button className="sc-person-open" onClick={open}><Avatar person={person} size="lg"/></button>
                <div className="sc-directory-identity">
                  <button className="sc-name-button" onClick={open}>{person.name}{isSelf && <span className="sc-you-badge">You</span>}</button>
                  <p>{person.role}</p>
                  <span><Icon name="pin" size={14}/>{person.location} · {person.chapter}</span>
                </div>
                <div className="sc-directory-interests">{person.interests.slice(0, 3).map((interest) => <span key={interest}>{interest}</span>)}</div>
                <div className="sc-directory-action">
                  {isSelf ? (
                    <button className="sc-follow-button" onClick={() => app.openSettings("profile")}>Edit</button>
                  ) : (
                    <>
                      <span>{person.mutual} mutual</span>
                      <FollowButton personId={person.id} name={person.name} following={store.follows.includes(person.id)} />
                    </>
                  )}
                </div>
              </article>
            );
          })}
          {filtered.length === 0 && <div className="sc-empty-state"><Icon name="search" size={28}/><h2>No one matches yet</h2><p>Try another chapter, location, or interest.</p><button className="sc-quiet-button" onClick={() => { setQuery(""); setChapter("All chapters"); setPlace("Anywhere"); setOpenOnly(false); }}>Clear filters</button></div>}
        </div>
      </section>
    </main>
  );
}

function ProfileView({ personId }: { personId: string }) {
  const store = useShowcase();
  const app = useApp();
  const isSelf = personId === VIEWER_ID;
  const person = store.person(personId);

  const authored = [...store.userThreads, ...forumThreads].filter((thread) => thread.author === personId);
  const myReplies = isSelf
    ? Object.entries(store.threadReplies).flatMap(([threadId, replies]) => replies.map((reply) => ({ threadId, reply })))
    : [];
  const threadTitle = (id: string) => [...store.userThreads, ...forumThreads].find((thread) => thread.id === id)?.title ?? "a discussion";
  const nextEvent = events.find((event) => store.rsvps.includes(event.id));

  function message() {
    const id = store.openConversationWith(personId);
    app.openConversation(id);
  }

  return (
    <main className="sc-page sc-profile-page">
      <button className="sc-back" onClick={() => app.goBack(isSelf ? "home" : "people")}><Icon name="arrow" size={17}/> Back</button>
      <section className="sc-profile-hero">
        <Avatar person={person} size="xl"/>
        <div className="sc-profile-heading">
          <span>{person.chapter}</span>
          <h1>{person.name}</h1>
          <p>{person.role}</p>
          <em><Icon name="pin" size={15}/>{person.location}</em>
        </div>
        <div className="sc-profile-actions">
          {isSelf ? (
            <>
              <button className="sc-primary-button" onClick={() => app.openSettings("profile")}>Edit profile</button>
              <button className="sc-quiet-button" onClick={() => app.openSettings("privacy")}>{store.settings.directoryVisible ? "Listed in directory" : "Hidden from directory"}</button>
            </>
          ) : (
            <>
              <FollowButton personId={person.id} name={person.name} following={store.follows.includes(person.id)} large />
              <button className="sc-quiet-button" onClick={message}><Icon name="message" size={17}/> Message</button>
            </>
          )}
        </div>
      </section>

      <section className="sc-profile-body">
        <div className="sc-profile-about">
          <h2>About</h2>
          {person.bio ? <p>{person.bio}</p> : <p className="sc-muted-copy">{isSelf ? "You haven't written a bio yet." : "No bio yet."} {isSelf && <button className="sc-text-link" onClick={() => app.openSettings("profile")}>Add one</button>}</p>}
          <h3>Questions I keep returning to</h3>
          {person.interests.length > 0
            ? <div className="sc-topic-chips">{person.interests.map((interest) => <span key={interest}>{interest}</span>)}</div>
            : <p className="sc-muted-copy">{isSelf ? "Add a few interests so members with the same questions can find you." : "Nothing listed yet."}</p>}
          <div className="sc-profile-stats">
            <span><strong>{person.events + (isSelf ? store.rsvps.length : 0)}</strong> events attended</span>
            <span><strong>{isSelf ? store.follows.length : person.mutual}</strong> {isSelf ? "following" : "mutual connections"}</span>
          </div>
        </div>
        <aside className="sc-profile-context">
          <h2>{isSelf ? "Your week" : "What you share"}</h2>
          <button className="sc-overlap-item" onClick={() => app.selectEvent(nextEvent?.id ?? events[0].id)}>
            <span className="sc-overlap-mark"><Icon name="calendar"/></span>
            <div>
              <strong>{nextEvent ? `${nextEvent.title} · ${nextEvent.month} ${nextEvent.day}` : "Philosophy Club"}</strong>
              <p>{isSelf ? (nextEvent ? "You're signed up." : "You haven't signed up for an event yet.") : "You're both members of this chapter's Wednesday group."}</p>
            </div>
          </button>
          <div className="sc-overlap-item">
            <span className="sc-overlap-mark"><Icon name="chapters"/></span>
            <div><strong>{person.chapter}</strong><p>{isSelf ? "Your home chapter." : "Their home chapter."}</p></div>
          </div>
          {person.interests[0] && (
            <div className="sc-overlap-item">
              <span className="sc-overlap-mark"><Icon name="spark"/></span>
              <div><strong>{person.interests[0]}</strong><p>{isSelf ? "A question you keep returning to." : "A question they keep returning to."}</p></div>
            </div>
          )}
        </aside>
      </section>

      <section className="sc-profile-contributions">
        <div className="sc-section-heading"><div><h2>{isSelf ? "Your contributions" : "Recent contributions"}</h2><p>{isSelf ? "Discussions you started and replies you left." : `Discussions ${person.name.split(" ")[0]} has started.`}</p></div></div>
        {authored.map((thread) => (
          <button key={thread.id} onClick={() => app.openThread(thread.id)}>
            <span>{thread.topic} · {thread.age}</span>
            <strong>{thread.title}</strong>
            <em>{thread.replies + (store.threadReplies[thread.id]?.length ?? 0)} replies</em>
          </button>
        ))}
        {myReplies.map(({ threadId, reply }) => (
          <button key={reply.id} onClick={() => app.openThread(threadId)}>
            <span>Reply · {reply.age}</span>
            <strong>&ldquo;{reply.body.length > 120 ? `${reply.body.slice(0, 120)}…` : reply.body}&rdquo;</strong>
            <em>on {threadTitle(threadId)}</em>
          </button>
        ))}
        {authored.length === 0 && myReplies.length === 0 && (
          <div className="sc-contrib-empty">
            <p>{isSelf ? "Nothing yet. The forum is a good place to start." : "No public contributions yet."}</p>
            {isSelf && <button className="sc-quiet-button" onClick={() => app.compose()}>Start a discussion</button>}
          </div>
        )}
      </section>
    </main>
  );
}

/* ------------------------------------------------------------------ */
/* Messages                                                            */
/* ------------------------------------------------------------------ */

function MessagesView({ initialConversation }: { initialConversation: string | null }) {
  const store = useShowcase();
  const app = useApp();
  const [activeId, setActiveId] = useState(initialConversation ?? "event-death");
  const [message, setMessage] = useState("");
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState("All");
  const historyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (initialConversation) setActiveId(initialConversation);
  }, [initialConversation]);

  const conversationList = store.allConversations;
  const active = conversationList.find((conversation) => conversation.id === activeId) || conversationList[0];
  const lines = [...active.history, ...(store.dms[active.id] ?? [])];

  useEffect(() => {
    store.markConversationRead(active.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active.id]);

  useEffect(() => {
    historyRef.current?.scrollTo({ top: historyRef.current.scrollHeight, behavior: "smooth" });
  }, [lines.length, active.id]);

  const visible = conversationList.filter((conversation) => {
    const matchesTab = tab === "All" || (tab === "Direct" ? conversation.kind === "Direct" : conversation.kind !== "Direct");
    const matchesQuery = !query.trim() || `${conversation.title} ${conversation.preview}`.toLowerCase().includes(query.toLowerCase());
    return matchesTab && matchesQuery;
  });

  function send() {
    if (!message.trim()) return;
    store.sendMessage(active.id, message);
    setMessage("");
  }

  return (
    <main className="sc-page sc-messages-page">
      <section className="sc-page-intro sc-messages-intro">
        <div><h1>Messages</h1><p>Talk one-to-one, with the people going to an event, or with your chapter&rsquo;s hosts.</p></div>
        <button className="sc-primary-button" onClick={app.openNewMessage}><Icon name="plus" size={17}/> New message</button>
      </section>
      <section className="sc-inbox-shell">
        <aside className="sc-conversation-index">
          <label><Icon name="search" size={17}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search messages"/></label>
          <div className="sc-inbox-tabs">{["All", "Direct", "Groups"].map((item) => <button key={item} className={tab === item ? "active" : ""} onClick={() => setTab(item)}>{item}</button>)}</div>
          <div className="sc-conversation-buttons">
            {visible.map((conversation) => {
              const unread = store.readConversations.includes(conversation.id) ? 0 : conversation.unread;
              const own = store.dms[conversation.id];
              return (
                <button className={active.id === conversation.id ? "active" : ""} key={conversation.id} onClick={() => setActiveId(conversation.id)}>
                  <span className={`sc-chat-mark ${conversation.kind !== "Direct" ? "sc-chat-mark-group" : ""}`}>
                    {conversation.kind === "Direct" ? <Avatar person={store.person(conversation.members[0])} size="md"/> : <Icon name={conversation.kind === "Event group" ? "calendar" : "people"} size={20}/>}
                  </span>
                  <span className="sc-chat-copy"><strong>{conversation.title}</strong><em>{own?.length ? `You: ${own[own.length - 1].body}` : conversation.preview}</em></span>
                  <span className="sc-chat-time">{own?.length ? "Now" : conversation.time}{unread > 0 && <b>{unread}</b>}</span>
                </button>
              );
            })}
            {visible.length === 0 && <p className="sc-inbox-empty">No conversations match that search.</p>}
          </div>
        </aside>
        <div className="sc-chat-panel">
          <header>
            <div><span>{active.kind}</span><h2>{active.title}</h2><p>{active.subtitle}</p></div>
            <div className="sc-chat-members"><AvatarStack ids={active.members}/>{active.kind === "Direct" && <button onClick={() => app.selectPerson(active.members[0])}>View profile</button>}</div>
          </header>
          <div className="sc-chat-history" ref={historyRef}>
            <div className="sc-chat-day"><span>Today</span></div>
            {lines.length === 0 && <p className="sc-chat-empty">Say hello — mention where you met, it helps.</p>}
            {lines.map((line, index) => {
              const self = line.from === "you" || line.from === VIEWER_ID;
              if (self) {
                return <article className="sc-own-message" key={index}><Avatar person={store.viewer} size="sm"/><div><strong>You <span>{line.time}</span></strong><p>{line.body}</p></div></article>;
              }
              const person = store.person(line.from);
              return <article key={index}><Avatar person={person} size="sm"/><div><strong>{person.name} <span>{line.time}</span></strong><p>{line.body}</p></div></article>;
            })}
          </div>
          <form className="sc-chat-composer" onSubmit={(event) => { event.preventDefault(); send(); }}>
            <textarea
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); send(); } }}
              placeholder={`Message ${active.title}`}
            />
            <div><span>Enter to send · Shift+Enter for a new line · Guidelines apply</span><button className="sc-primary-button" disabled={!message.trim()}>Send</button></div>
          </form>
        </div>
      </section>

      <OrganizerNotice />
    </main>
  );
}

// The club is open to the public, so the escalation path has to be as easy as
// sending a message and has to let the member choose what happens next.
function OrganizerNotice() {
  const store = useShowcase();
  const app = useApp();
  const [open, setOpen] = useState(false);
  const [sent, setSent] = useState(false);
  const [recipient, setRecipient] = useState("amara");
  const [outcome, setOutcome] = useState("on-record");
  const [detail, setDetail] = useState("");
  const chosen = store.person(recipient);

  function submit(event: FormEvent) {
    event.preventDefault();
    setSent(true);
    app.notify(`Sent privately to ${chosen.name.split(" ")[0]}`);
  }

  if (sent) {
    return (
      <section className="sc-organizer-notice sent">
        <Icon name="check" size={26}/>
        <div>
          <h2>{chosen.name.split(" ")[0]} has it.</h2>
          <p>She replies within 24 hours. You chose <strong>{outcome === "on-record" ? "on record only" : outcome === "quiet" ? "a quiet word" : "a formal response"}</strong>, and nothing happens beyond that without you. Reference <strong>NYPC-2419</strong>.</p>
        </div>
        <button className="sc-quiet-button" onClick={() => { setSent(false); setOpen(false); setDetail(""); }}>Done</button>
      </section>
    );
  }

  return (
    <section className={open ? "sc-organizer-notice open" : "sc-organizer-notice"}>
      <div className="sc-organizer-head">
        <Icon name="shield" size={24}/>
        <div>
          <h2>Tell an organizer something</h2>
          <p>If anything felt uncomfortable, unsafe, or just off — at an event or in a message — it goes to a named volunteer, not a shared inbox. You decide what happens next, and nothing is ever public.</p>
        </div>
        {!open && <button className="sc-primary-button" onClick={() => setOpen(true)}>Raise something</button>}
      </div>

      {open && (
        <form className="sc-organizer-form" onSubmit={submit}>
          <div className="sc-field">
            <span>Who should see this</span>
            <div className="sc-choice-row">
              {careTeam.map((member) => {
                const person = store.person(member.id);
                return (
                  <button type="button" key={member.id} className={recipient === member.id ? "active" : ""} onClick={() => setRecipient(member.id)}>
                    <Avatar person={person} size="sm"/>
                    <span><strong>{person.name.split(" ")[0]}</strong><em>{member.role.split(" · ")[1] || member.role}</em></span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="sc-field">
            <span>What you want to happen</span>
            <div className="sc-choice-stack">
              <button type="button" className={outcome === "on-record" ? "active" : ""} onClick={() => setOutcome("on-record")}>
                <strong>Just put it on record</strong>
                <em>No action now. Kept so a repeated pattern can be seen later.</em>
              </button>
              <button type="button" className={outcome === "quiet" ? "active" : ""} onClick={() => setOutcome("quiet")}>
                <strong>Have a quiet word with them</strong>
                <em>A volunteer speaks to them privately. Your name is never used.</em>
              </button>
              <button type="button" className={outcome === "formal" ? "active" : ""} onClick={() => setOutcome("formal")}>
                <strong>I need a formal response</strong>
                <em>Organizers review it and decide on attendance.</em>
              </button>
            </div>
          </div>

          <label className="sc-field">
            <span>In your words <em>optional</em></span>
            <textarea value={detail} onChange={(event) => setDetail(event.target.value)} placeholder="A single sentence is enough. You don't need to explain or justify it."/>
          </label>

          <div className="sc-organizer-actions">
            <button type="submit" className="sc-primary-button">Send to {chosen.name.split(" ")[0]}</button>
            <button type="button" className="sc-quiet-button" onClick={() => setOpen(false)}>Cancel</button>
          </div>
        </form>
      )}
    </section>
  );
}

function DiscussionView() {
  const store = useShowcase();
  const app = useApp();
  const threadKey = "afterlife-love";
  const [reply, setReply] = useState("");
  const replyRef = useRef<HTMLTextAreaElement>(null);
  const seeded: { author: string; time: string; body: string; wasThere: boolean }[] = [
    { author: "amara", time: "2 days ago", body: "Maybe conviction is less about being certain and more about accepting responsibility for what follows from our choices.", wasThere: true },
    { author: "julian", time: "Yesterday", body: "I keep thinking about whether uncertainty can be shared. A group may act more responsibly when no single person has to perform complete confidence.", wasThere: true },
    { author: "maya", time: "3 hours ago", body: "That feels especially true in city planning. Waiting for perfect evidence is itself a decision, and usually someone bears the cost of that waiting.", wasThere: true },
  ];
  const added = (store.threadReplies[threadKey] ?? []).map((item) => ({ author: item.author, time: item.age, body: item.body, wasThere: false }));
  const posts = [...seeded, ...added];

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!reply.trim()) return;
    store.replyToThread(threadKey, reply);
    setReply("");
    app.notify("Your thought was added to the conversation");
  }

  function replyTo(name: string) {
    setReply(`@${name} `);
    window.setTimeout(() => replyRef.current?.focus(), 0);
  }

  return (
    <main className="sc-page sc-discussion-page">
      <button className="sc-back" onClick={() => app.goBack("event")}><Icon name="arrow" size={17}/> Back</button>
      <section className="sc-discussion-header">
        <span>Room 52 · Midtown East · After the event</span>
        <h1>When does uncertainty become an excuse not to act?</h1>
        <p>A thread that started at Philosophy Club on September 9 and kept going.</p>
        <div><AvatarStack ids={["amara", "julian", "maya", "theo"]}/><span>{posts.length + 11} members contributing</span></div>
      </section>
      <section className="sc-thread">
        {posts.map((post, index) => {
          const author = store.person(post.author);
          const self = post.author === VIEWER_ID;
          return (
            <article className="sc-post" key={`${post.author}-${index}`}>
              <Avatar person={author}/>
              <div>
                <header><strong>{author.name}{self ? " (you)" : ""}</strong><span>{post.time}{post.wasThere ? " · Was there" : ""}</span></header>
                <p>{post.body}</p>
                {!self && <button onClick={() => replyTo(author.name.split(" ")[0])}>Reply</button>}
              </div>
            </article>
          );
        })}
        <form className="sc-reply-box" onSubmit={submit}>
          <Avatar person={store.viewer} size="md"/>
          <label><span>Add your thought</span><textarea ref={replyRef} value={reply} onChange={(event) => setReply(event.target.value)} placeholder="What does this question bring up for you?"/><em>Respond to the idea, not the person.</em></label>
          <button className="sc-primary-button" disabled={!reply.trim()}>Post reply</button>
        </form>
      </section>
    </main>
  );
}

/* ------------------------------------------------------------------ */
/* Settings                                                            */
/* ------------------------------------------------------------------ */

function initialsOf(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return ((parts[0][0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

function SettingsView({ section }: { section: SettingsSection }) {
  const store = useShowcase();
  const app = useApp();
  const account = store.account;
  const [name, setName] = useState(account?.name ?? "");
  const [role, setRole] = useState(account?.role ?? "");
  const [location, setLocation] = useState(account?.location ?? "");
  const [chapter, setChapter] = useState(account?.chapter ?? "New York");
  const [bio, setBio] = useState(account?.bio ?? "");
  const [interests, setInterests] = useState<string[]>(account?.interests ?? []);
  const [interestDraft, setInterestDraft] = useState("");
  const [error, setError] = useState("");
  const [confirmReset, setConfirmReset] = useState(false);

  useEffect(() => {
    window.setTimeout(() => document.getElementById(`settings-${section}`)?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
  }, [section]);

  if (!account) return null;

  const isDemo = account.email === DEMO_EMAIL;
  const dirty = name !== account.name || role !== account.role || location !== account.location || chapter !== account.chapter || bio !== account.bio || interests.join("|") !== account.interests.join("|");

  function addInterest() {
    const value = interestDraft.trim().replace(/,$/, "");
    if (!value) return;
    if (!interests.some((item) => item.toLowerCase() === value.toLowerCase()) && interests.length < 6) setInterests([...interests, value]);
    setInterestDraft("");
  }

  function saveProfile(event: FormEvent) {
    event.preventDefault();
    if (name.trim().split(/\s+/).length < 2) { setError("Use your first and last name — the club runs on real names."); return; }
    store.updateAccount({ name: name.trim(), role: role.trim() || "Member", location: location.trim(), chapter, bio: bio.trim(), interests });
    setError("");
    app.notify("Profile saved");
  }

  const privacy = (patch: Partial<Settings>, message: string) => {
    store.updateSettings(patch);
    app.notify(message);
  };

  const nav: { id: SettingsSection; label: string }[] = [
    { id: "profile", label: "Profile" },
    { id: "privacy", label: "Privacy" },
    { id: "notifications", label: "Notifications" },
    { id: "account", label: "Account" },
  ];

  return (
    <main className="sc-page sc-settings-page">
      <section className="sc-page-intro">
        <div><h1>Settings</h1><p>What other members see, and what reaches you.</p></div>
        <button className="sc-quiet-button" onClick={app.viewOwnProfile}>View your profile</button>
      </section>

      <div className="sc-settings-layout">
        <nav className="sc-settings-nav" aria-label="Settings sections">
          {nav.map((item) => (
            <button key={item.id} className={section === item.id ? "active" : ""} onClick={() => app.openSettings(item.id)}>{item.label}</button>
          ))}
        </nav>

        <div className="sc-settings-body">
          <section id="settings-profile" className="sc-settings-card">
            <header><h2>Profile</h2><p>Shown on your profile and in the directory when you&rsquo;re listed.</p></header>
            <form onSubmit={saveProfile} className="sc-settings-form">
              <div className="sc-settings-identity">
                <Avatar person={{ ...store.viewer, name, initials: initialsOf(name) }} size="xl" />
                <div>
                  <strong>{name || "Your name"}</strong>
                  <em>{role || "Member"} · {chapter}</em>
                </div>
              </div>
              <div className="sc-field-grid">
                <label className="sc-input-field"><span>Full name</span><input value={name} onChange={(event) => { setName(event.target.value); setError(""); }} /></label>
                <label className="sc-input-field"><span>How you describe yourself</span><input value={role} onChange={(event) => setRole(event.target.value)} placeholder="Philosopher, teacher, curious person…" /></label>
                <label className="sc-input-field"><span>Neighborhood or city</span><input value={location} onChange={(event) => setLocation(event.target.value)} placeholder="Manhattan, New York" /></label>
                <label className="sc-input-field">
                  <span>Home chapter</span>
                  <select value={chapter} onChange={(event) => setChapter(event.target.value)}>
                    {chapters.map((item) => <option key={item.name} value={item.name}>{item.name}</option>)}
                  </select>
                </label>
              </div>
              <label className="sc-input-field">
                <span>About</span>
                <textarea value={bio} onChange={(event) => setBio(event.target.value)} rows={3} maxLength={280} placeholder="What brings you to the club?" />
                <small>{bio.length}/280</small>
              </label>
              <div className="sc-input-field">
                <span>Questions you keep returning to</span>
                <div className="sc-tag-input">
                  {interests.map((item) => (
                    <span key={item} className="sc-tag">{item}<button type="button" onClick={() => setInterests(interests.filter((entry) => entry !== item))} aria-label={`Remove ${item}`}><Icon name="close" size={12}/></button></span>
                  ))}
                  {interests.length < 6 && (
                    <input
                      value={interestDraft}
                      onChange={(event) => setInterestDraft(event.target.value)}
                      onKeyDown={(event) => { if (event.key === "Enter" || event.key === ",") { event.preventDefault(); addInterest(); } else if (event.key === "Backspace" && !interestDraft && interests.length) { setInterests(interests.slice(0, -1)); } }}
                      onBlur={addInterest}
                      placeholder={interests.length ? "Add another" : "Consciousness, ethics…"}
                    />
                  )}
                </div>
                <small>Press Enter to add · up to 6</small>
              </div>
              {error && <p className="sc-field-error" role="alert">{error}</p>}
              <div className="sc-settings-actions">
                <button type="submit" className="sc-primary-button" disabled={!dirty}>Save profile</button>
                {dirty && <button type="button" className="sc-quiet-button" onClick={() => { setName(account.name); setRole(account.role); setLocation(account.location); setChapter(account.chapter); setBio(account.bio); setInterests(account.interests); setError(""); }}>Discard changes</button>}
              </div>
            </form>
          </section>

          <section id="settings-privacy" className="sc-settings-card">
            <header><h2>Privacy</h2><p>Every one of these is opt-in and takes effect immediately.</p></header>
            <div className="sc-toggle-list">
              <Toggle checked={store.settings.directoryVisible} onChange={(value) => privacy({ directoryVisible: value }, value ? "You're listed in the directory" : "You're hidden from the directory and search")} label="Appear in the member directory" description="When off, you disappear from the Community directory and from member search." />
              <Toggle checked={store.settings.openToConnect} onChange={(value) => privacy({ openToConnect: value }, value ? "Marked as open to connect" : "No longer shown as open to connect")} label="Open to connect" description="Lets members who share your questions know it's welcome to reach out." />
              <Toggle checked={store.settings.showAttendance} onChange={(value) => privacy({ showAttendance: value }, value ? "Your attendance is visible" : "Your attendance is hidden")} label="Show which events I'm attending" description="When off, you still attend — you just aren't listed among the members going." />
            </div>
          </section>

          <section id="settings-notifications" className="sc-settings-card">
            <header><h2>Notifications</h2><p>Choose what reaches your bell. Changes apply to the list right away.</p></header>
            <div className="sc-toggle-list">
              <Toggle checked={store.settings.notifications.replies} onChange={(value) => store.updateNotificationPrefs({ replies: value })} label="Replies" description="When someone answers a discussion or comment of yours." />
              <Toggle checked={store.settings.notifications.mentions} onChange={(value) => store.updateNotificationPrefs({ mentions: value })} label="Mentions" description="When a member names you in a thread." />
              <Toggle checked={store.settings.notifications.messages} onChange={(value) => store.updateNotificationPrefs({ messages: value })} label="Messages" description="New direct and group messages." />
              <Toggle checked={store.settings.notifications.events} onChange={(value) => store.updateNotificationPrefs({ events: value })} label="Events and registration" description="When registration opens, and changes to events you're signed up for." />
              <Toggle checked={store.settings.notifications.weeklyDigest} onChange={(value) => store.updateNotificationPrefs({ weeklyDigest: value })} label="Weekly digest email" description="One email on Monday with the week's events and the best threads." />
            </div>
          </section>

          <section id="settings-account" className="sc-settings-card">
            <header><h2>Account</h2><p>Signed in as {account.email}.</p></header>
            <div className="sc-account-rows">
              <div><span>Email</span><strong>{account.email}</strong></div>
              <div><span>Chapters joined</span><strong>{store.joinedChapters.join(", ") || "None yet"}</strong></div>
              <div><span>Events signed up for</span><strong>{store.rsvps.length}</strong></div>
            </div>
            <div className="sc-settings-actions">
              <button className="sc-quiet-button" onClick={store.signOut}><Icon name="logout" size={16}/> Log out</button>
              {!confirmReset
                ? <button className="sc-text-link sc-danger" onClick={() => setConfirmReset(true)}>{isDemo ? "Reset the demo member" : "Reset showcase activity"}</button>
                : (
                  <span className="sc-confirm">
                    {isDemo ? "Undo everything done as the demo member and start fresh?" : "Clear browser-local showcase activity? Your forum account is not deleted."}
                    <button className="sc-text-link sc-danger" onClick={store.resetAccount}>Reset</button>
                    <button className="sc-text-link" onClick={() => setConfirmReset(false)}>Keep</button>
                  </span>
                )}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}

/* ------------------------------------------------------------------ */
/* Root                                                                */
/* ------------------------------------------------------------------ */

function ShowcaseApp() {
  const store = useShowcase();
  const { user: authUser } = useAuth();
  const [view, setView] = useState<View>("home");
  const [history, setHistory] = useState<View[]>([]);
  const [selectedEventId, setSelectedEventId] = useState(events[0].id);
  const [selectedPersonId, setSelectedPersonId] = useState("maya");
  const [threadId, setThreadId] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [settingsSection, setSettingsSection] = useState<SettingsSection>("profile");
  const [eventFocus, setEventFocus] = useState<"locations" | null>(null);
  const [composePreset, setComposePreset] = useState<ComposePreset>({});
  const [toast, setToast] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [noticesOpen, setNoticesOpen] = useState(false);
  const [newMessageOpen, setNewMessageOpen] = useState(false);
  const [viewKey, setViewKey] = useState(0);
  const toastTimer = useRef<number | undefined>(undefined);
  const wasSignedIn = useRef<boolean | null>(null);

  // Every sign-in lands on Home with a greeting; every sign-out clears the session's
  // navigation so the next member doesn't inherit where the last one was.
  useEffect(() => {
    if (!store.hydrated) return;
    const previous = wasSignedIn.current;
    wasSignedIn.current = store.signedIn;
    if (previous === null) return;
    if (!previous && store.signedIn) {
      setView("home");
      setHistory([]);
      setViewKey((key) => key + 1);
      window.scrollTo({ top: 0 });
      notify(`Welcome, ${store.viewer.name.split(" ")[0]}`);
    }
    if (previous && !store.signedIn) {
      setSearchOpen(false);
      setNoticesOpen(false);
      setNewMessageOpen(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.hydrated, store.signedIn]);

  // "/" or Cmd/Ctrl+K opens search from anywhere, as in any app people know.
  useEffect(() => {
    if (!store.signedIn) return;
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      const typing = target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable;
      if ((event.key === "k" && (event.metaKey || event.ctrlKey)) || (event.key === "/" && !typing)) {
        event.preventDefault();
        if (store.account?.email === DEMO_EMAIL) setSearchOpen(true);
        else window.location.assign("/search");
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [store.account?.email, store.signedIn]);

  // A view that scrolls itself to a section on arrival skips the jump to the top,
  // otherwise the two smooth scrolls fight and the member lands in between.
  function navigate(next: View, scrollToTop = true) {
    if (store.account?.email !== DEMO_EMAIL && next === "messages") {
      window.location.assign("/messages");
      return;
    }
    setHistory((current) => [...current.slice(-9), view]);
    setView(next);
    setViewKey((key) => key + 1);
    setNoticesOpen(false);
    if (next !== "forum") setThreadId(null);
    if (next !== "messages") setConversationId(null);
    if (scrollToTop) window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function goBack(fallback: View) {
    const previous = history.at(-1);
    setHistory((current) => current.slice(0, -1));
    setView(previous || fallback);
    setViewKey((key) => key + 1);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function notify(message: string) {
    setToast(message);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(""), 2800);
  }

  const app: App = {
    view,
    navigate,
    goBack,
    selectEvent: (id, focus) => { setSelectedEventId(id); setEventFocus(focus ?? null); navigate("event", !focus); },
    selectPerson: (id) => {
      if (store.account?.email !== DEMO_EMAIL) {
        if (people.some((person) => person.id === id)) { notify("That sample profile is available only in demo mode."); return; }
        window.location.assign(`/u/${encodeURIComponent(id)}`);
        return;
      }
      setSelectedPersonId(id); navigate("profile");
    },
    viewOwnProfile: () => {
      if (store.account?.email !== DEMO_EMAIL && authUser?.id) { window.location.assign(`/u/${encodeURIComponent(authUser.id)}`); return; }
      setSelectedPersonId(VIEWER_ID); navigate("profile");
    },
    openThread: (id) => { navigate("forum"); setThreadId(id); },
    openConversation: (id) => {
      if (store.account?.email !== DEMO_EMAIL) { window.location.assign(`/messages/${encodeURIComponent(id)}`); return; }
      navigate("messages"); setConversationId(id);
    },
    openSettings: (section = "profile") => {
      if (store.account?.email !== DEMO_EMAIL) { window.location.assign(section === "profile" ? "/settings/profile" : "/settings"); return; }
      setSettingsSection(section);
      if (view !== "settings") navigate("settings");
    },
    compose: (preset = {}) => { setComposePreset(preset); navigate("compose"); },
    notify,
    openSearch: () => {
      if (store.account?.email !== DEMO_EMAIL) { window.location.assign("/search"); return; }
      setNoticesOpen(false); setSearchOpen(true);
    },
    openNewMessage: () => {
      if (store.account?.email !== DEMO_EMAIL) { window.location.assign("/messages"); return; }
      setNewMessageOpen(true);
    },
  };

  const selectedEvent = events.find((event) => event.id === selectedEventId) || events[0];
  const demo = store.account?.email === DEMO_EMAIL;

  // Members-only: nothing about the community renders until someone has signed in.
  if (!store.hydrated) return <div className="showcase-root"><SplashScreen /></div>;
  if (!store.signedIn) return <div className="showcase-root"><LoginScreen /></div>;

  return (
    <AppContext.Provider value={app}>
      <div className="showcase-root">
        <AppNav noticesOpen={noticesOpen} setNoticesOpen={setNoticesOpen} />
        {demo && SHOWCASE_REVIEW_MODE && <div className="sc-preview-note" role="status">Interactive review - people and discussions are illustrative. No account or club data is changed. For current events, use the <a href={LUMA_CALENDAR_URL} target="_blank" rel="noopener noreferrer">club calendar</a>.</div>}
        {!demo && view === "discussion" && <div className="sc-preview-note" role="status">This discussion is a preview. Its examples and actions are not saved to the forum. <button onClick={() => app.navigate("forum")}>Go to the connected forum</button></div>}
        <div className="sc-view" key={`${view}-${viewKey}`}>
          {view === "home" && (SHOWCASE_REVIEW_MODE ? <ReviewHomeView /> : <ConnectedHomeView />)}
          {view === "events" && (SHOWCASE_REVIEW_MODE ? <ReviewEventsView /> : <ConnectedEventsView />)}
          {view === "event" && (SHOWCASE_REVIEW_MODE ? <ReviewEventsView /> : demo && events.some((item) => item.id === selectedEventId) ? <EventView event={selectedEvent} focus={eventFocus} /> : <ConnectedEventView id={selectedEventId} />)}
          {view === "forum" && <ForumView initialThread={threadId} />}
          {view === "compose" && <ComposeView preset={composePreset} />}
          {view === "guidelines" && <GuidelinesView />}
          {view === "people" && <PeopleView />}
          {view === "profile" && <ProfileView personId={selectedPersonId} />}
          {view === "messages" && <MessagesView initialConversation={conversationId} />}
          {view === "discussion" && <DiscussionView />}
          {view === "settings" && <SettingsView section={settingsSection} />}
        </div>
        <footer className="sc-site-foot">
          <span>The New York Philosophy Club · Pursuing wisdom, together</span>
          <span>Community · <button className="sc-text-link" onClick={() => app.navigate("guidelines")}>Guidelines</button></span>
        </footer>
        {searchOpen && <SearchOverlay onClose={() => setSearchOpen(false)} />}
        {newMessageOpen && <NewMessagePicker onClose={() => setNewMessageOpen(false)} />}
        {toast && <div className="sc-toast" role="status" aria-live="polite"><Icon name="check" size={18}/>{toast}</div>}
      </div>
    </AppContext.Provider>
  );
}

export default function ShowcasePage() {
  return (
    <ShowcaseProvider>
      <ShowcaseApp />
    </ShowcaseProvider>
  );
}
