"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAuth } from "~/lib/auth-context";
import { OAuthButtons } from "../oauth-buttons";

export default function SignupPage() {
  const { signup } = useAuth();
  const router = useRouter();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await signup(email, password, `${firstName.trim()} ${lastName.trim()}`.trim());
      router.push("/");
    } catch (err: any) {
      setError(err.message ?? "Signup failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/nypc-icon.png" alt="The New York Philosophy Club" className="auth-logo" />
        <h1 className="auth-title">Create your account</h1>
        <p className="auth-subtitle">
          Already have one? <Link href="/login">Log in</Link>
        </p>

        <OAuthButtons />

        <form onSubmit={onSubmit}>
          <div className="field-pair">
            <label>
              First name
              <input
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="Jane"
                required
              />
            </label>
            <label>
              Last name
              <input
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Doe"
                required
              />
            </label>
          </div>
          <label>
            Email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>
          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={8}
              required
            />
          </label>
          {error && <p className="error">{error}</p>}
          <button type="submit" disabled={submitting}>
            {submitting ? "Creating account..." : "Create account"}
          </button>
        </form>

        <p className="auth-note">
          We ask for your real name because too much of the internet is anonymous and one-off.
          Philosophy works better when people answer for what they say and can trust the person
          across from them.
        </p>
      </div>
    </div>
  );
}
