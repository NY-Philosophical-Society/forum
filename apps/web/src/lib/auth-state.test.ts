import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { ApiError } from "./api";
import { classifyAccountLoadError, createLatestRequestGate, oauthRedirectUrl } from "./auth-state";

describe("C1: authentication state boundaries", () => {
  it.each([401, 403, 404])("classifies HTTP %s as a rejected forum session", (status) => {
    expect(classifyAccountLoadError(new ApiError("rejected", "http", status))).toBe("session-rejected");
  });

  it.each([
    new ApiError("offline", "network"),
    new ApiError("slow", "timeout"),
    new ApiError("down", "http", 503),
    new Error("unexpected"),
  ])("keeps infrastructure failures distinct from rejected accounts", (error) => {
    expect(classifyAccountLoadError(error)).toBe("account-unavailable");
  });

  it("builds an exact same-origin showcase return URL", () => {
    expect(oauthRedirectUrl("/showcase", "http://127.0.0.1:3100/current"))
      .toBe("http://127.0.0.1:3100/showcase");
  });

  it("allow-lists the local showcase OAuth return URLs exactly", () => {
    const config = readFileSync(new URL("../../../../supabase/config.toml", import.meta.url), "utf8");
    for (const url of [
      "http://localhost:3000/showcase",
      "http://127.0.0.1:3000/showcase",
      "http://localhost:3100/showcase",
      "http://127.0.0.1:3100/showcase",
    ]) {
      expect(config).toContain(`"${url}"`);
    }
  });

  it("refuses an external OAuth return URL", () => {
    expect(() => oauthRedirectUrl("https://attacker.example/callback", "https://forum.example"))
      .toThrow(/same.*origin/i);
  });

  it("cancels a superseded account load and accepts only the latest ticket", () => {
    const gate = createLatestRequestGate();
    const first = gate.next();
    const second = gate.next();
    expect(first.signal.aborted).toBe(true);
    expect(first.isCurrent()).toBe(false);
    expect(second.signal.aborted).toBe(false);
    expect(second.isCurrent()).toBe(true);
  });

  it("invalidates a pending account load on logout", () => {
    const gate = createLatestRequestGate();
    const pending = gate.next();
    gate.invalidate();
    expect(pending.signal.aborted).toBe(true);
    expect(pending.isCurrent()).toBe(false);
  });
});
