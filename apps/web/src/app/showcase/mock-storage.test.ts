import { describe, expect, it } from "vitest";
import { clearRetiredShowcaseData, RETIRED_SHOWCASE_KEYS } from "./mock-storage";

describe("showcase prototype storage cleanup", () => {
  it("removes only known mock keys, leaving Supabase and unrelated storage untouched", () => {
    const values = new Map<string, string>([
      ...RETIRED_SHOWCASE_KEYS.map((key) => [key, "mock"] as const),
      ["sb-example-auth-token", "session"],
      ["unrelated-preference", "keep"],
    ]);
    const removed: string[] = [];
    clearRetiredShowcaseData({ removeItem(key) { removed.push(key); values.delete(key); } });
    expect(removed).toEqual([...RETIRED_SHOWCASE_KEYS]);
    expect(values).toEqual(new Map([
      ["sb-example-auth-token", "session"],
      ["unrelated-preference", "keep"],
    ]));
  });
});
