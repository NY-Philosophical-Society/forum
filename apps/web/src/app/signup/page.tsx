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
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    if (password !== confirmPassword) { setError("Passwords do not match."); return; }
    setSubmitting(true);
    try {
      const result = await signup(email, password, `${firstName.trim()} ${lastName.trim()}`.trim());
      if (result.confirmationRequired) {
        setMessage("Check your email to confirm your account, then log in.");
      } else {
        router.push("/");
      }
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
          <div className="row" style={{ gap: "0.75rem" }}>
            <label style={{ flex: 1 }}>
              First name
              <input
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="Jane"
                required
              />
            </label>
            <label style={{ flex: 1 }}>
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
            <span className="password-field"><input type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} autoComplete="new-password" aria-label="Password" required/><button type="button" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? "Hide password" : "Show password"}>{showPassword ? "Hide" : "Show"}</button></span>
          </label>
          <label>
            Confirm password
            <input type={showPassword ? "text" : "password"} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} autoComplete="new-password" required/>
          </label>
          {error && <p className="error">{error}</p>}
          {message && <p className="success" role="status">{message}</p>}
          <button type="submit" disabled={submitting}>
            {submitting ? "Creating account..." : "Create account"}
          </button>
        </form>

        <p className="auth-footer">
          Use the name you would share at a club discussion. An account lets you participate in
          the public forum; verified identity, supporter access, and Society membership are
          separate statuses and are not granted by signing up.
        </p>
      </div>
    </div>
  );
}
