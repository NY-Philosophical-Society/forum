import { afterEach, describe, expect, it, vi } from "vitest";
import { memberApi } from "./member-api";

afterEach(() => vi.unstubAllGlobals());

describe("member directory API boundary", () => {
  it("queries the protected endpoint with encoded search and partner filter", async () => {
    const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(() => Promise.resolve(new Response(JSON.stringify({ entries: [], total: 0, limit: 30, offset: 0, hasMore: false }), { status: 200, headers: { "Content-Type": "application/json" } })));
    vi.stubGlobal("fetch", fetchMock);
    await memberApi.directory({ q: "  ethics & art  ", partners: true }, "member-token");
    expect(fetchMock.mock.calls[0][0]).toBe("/api/directory?limit=30&offset=0&q=ethics+%26+art&partners=1");
    expect(fetchMock.mock.calls[0][1]?.headers).toMatchObject({ Authorization: "Bearer member-token" });
  });

  it("rejects malformed directory rows instead of displaying invented members", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response(JSON.stringify({ entries: [{ user: { id: "partial" } }], total: 1, limit: 30, offset: 0, hasMore: false }), { status: 200, headers: { "Content-Type": "application/json" } }))));
    await expect(memberApi.directory({}, "member-token")).rejects.toMatchObject({ kind: "invalid-response" });
  });

  it("preserves the server's membership denial instead of falling back to sample people", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response(JSON.stringify({ error: "Membership required" }), { status: 403, headers: { "Content-Type": "application/json" } }))));
    await expect(memberApi.directory({}, "member-token")).rejects.toMatchObject({ kind: "http", status: 403 });
  });

  it("requests the next page using the server offset", async () => {
    const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(() => Promise.resolve(new Response(JSON.stringify({ entries: [], total: 35, limit: 30, offset: 30, hasMore: false }), { status: 200, headers: { "Content-Type": "application/json" } })));
    vi.stubGlobal("fetch", fetchMock);
    const result = await memberApi.directory({ offset: 30 }, "member-token");
    expect(result.offset).toBe(30);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/directory?limit=30&offset=30");
  });
});
