import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "./api";

const fetchMock = vi.fn<typeof fetch>();
const ok = () => Response.json({ items: ["saved"] });
const unavailable = () => Response.json({ error: "Try later" }, { status: 503 });
function pendingUntilAbort(_input: unknown, init?: RequestInit): Promise<Response> {
  return new Promise((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => reject(init.signal!.reason), { once: true });
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(Math, "random").mockReturnValue(0.5);
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
});
afterEach(() => {
  expect(vi.getTimerCount()).toBe(0);
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("C0: browser to same-origin API", () => {
  it("sends a session token in the header, never the URL, and returns the response", async () => {
    fetchMock.mockResolvedValueOnce(ok());
    await expect(api.get("/api/threads", "synthetic-token")).resolves.toEqual({ items: ["saved"] });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/threads");
    expect(init?.headers).toMatchObject({ Authorization: "Bearer synthetic-token" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("omits authorization for an anonymous read", async () => {
    fetchMock.mockResolvedValueOnce(ok());
    await api.get("/api/threads");
    expect(fetchMock.mock.calls[0][1]?.headers).not.toHaveProperty("Authorization");
  });

  it.each([400, 401, 403, 404, 409, 422, 500])("preserves HTTP %s without retry or pretending success", async (status) => {
    fetchMock.mockResolvedValueOnce(Response.json({ error: "Request rejected" }, { status }));
    await expect(api.get("/api/threads")).rejects.toMatchObject({ kind: "http", status, message: "Request rejected" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([408, 429, 502, 503, 504])("retries a transient HTTP %s read with backoff", async (status) => {
    fetchMock.mockResolvedValueOnce(Response.json({}, { status })).mockResolvedValueOnce(ok());
    const result = api.get("/api/threads");
    await vi.advanceTimersByTimeAsync(249);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    await expect(result).resolves.toEqual({ items: ["saved"] });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("caps repeated server failures at three attempts", async () => {
    fetchMock.mockImplementation(async () => unavailable());
    const result = expect(api.get("/api/threads")).rejects.toMatchObject({ status: 503 });
    await vi.advanceTimersByTimeAsync(750);
    await result;
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("recovers from a dropped read connection", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("offline")).mockResolvedValueOnce(ok());
    const result = api.get("/api/threads");
    await vi.advanceTimersByTimeAsync(250);
    await expect(result).resolves.toEqual({ items: ["saved"] });
  });

  it("retries when the connection drops while reading a successful response body", async () => {
    const brokenBody = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('{"items":['));
        controller.error(new TypeError("response stream disconnected"));
      },
    });
    fetchMock
      .mockResolvedValueOnce(new Response(brokenBody, { headers: { "Content-Type": "application/json" } }))
      .mockResolvedValueOnce(ok());
    const result = api.get("/api/threads");
    await vi.advanceTimersByTimeAsync(250);
    await expect(result).resolves.toEqual({ items: ["saved"] });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("bounds repeated network failures", async () => {
    fetchMock.mockRejectedValue(new TypeError("offline"));
    const result = expect(api.get("/api/threads")).rejects.toMatchObject({ kind: "network" });
    await vi.advanceTimersByTimeAsync(750);
    await result;
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it.each(["2", "date"])("honors Retry-After expressed as %s", async (format) => {
    vi.setSystemTime(new Date("2026-09-20T12:00:00Z"));
    const header = format === "date" ? new Date(Date.now() + 2000).toUTCString() : format;
    fetchMock.mockResolvedValueOnce(Response.json({}, { status: 429, headers: { "Retry-After": header } })).mockResolvedValueOnce(ok());
    const result = api.get("/api/threads");
    await vi.advanceTimersByTimeAsync(1999);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    await expect(result).resolves.toEqual({ items: ["saved"] });
  });

  it("returns a long rate-limit delay instead of retrying early or hanging", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({}, { status: 429, headers: { "Retry-After": "60" } }));
    await expect(api.get("/api/threads")).rejects.toMatchObject({ status: 429, retryAfterMs: 60000 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("uses bounded backoff for an invalid Retry-After header", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({}, { status: 503, headers: { "Retry-After": "invalid" } })).mockResolvedValueOnce(ok());
    const result = api.get("/api/threads");
    await vi.advanceTimersByTimeAsync(250);
    await expect(result).resolves.toEqual({ items: ["saved"] });
  });

  it("times out a request that never returns headers", async () => {
    fetchMock.mockImplementationOnce(pendingUntilAbort);
    const result = expect(api.get("/api/threads", null, { timeoutMs: 1000 })).rejects.toMatchObject({ kind: "timeout" });
    await vi.advanceTimersByTimeAsync(1000);
    await result;
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("includes body reading in the deadline", async () => {
    fetchMock.mockImplementationOnce(async (_url, init) => ({
      ok: true,
      status: 200,
      json: () => pendingUntilAbort("", init),
    }) as unknown as Response);
    const result = expect(api.get("/api/threads", null, { timeoutMs: 1000 })).rejects.toMatchObject({ kind: "timeout" });
    await vi.advanceTimersByTimeAsync(1000);
    await result;
  });

  it("keeps the total deadline across retry attempts", async () => {
    fetchMock.mockResolvedValueOnce(unavailable()).mockImplementationOnce(pendingUntilAbort);
    const result = expect(api.get("/api/threads", null, { timeoutMs: 1000 })).rejects.toMatchObject({ kind: "timeout" });
    await vi.advanceTimersByTimeAsync(1000);
    await result;
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("cancels an in-flight read when its screen leaves", async () => {
    const controller = new AbortController();
    fetchMock.mockImplementationOnce(pendingUntilAbort);
    const result = expect(api.get("/api/threads", null, { signal: controller.signal })).rejects.toMatchObject({ kind: "cancelled" });
    controller.abort();
    await result;
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("cancels retry backoff without issuing another request", async () => {
    const controller = new AbortController();
    fetchMock.mockResolvedValueOnce(unavailable());
    const result = expect(api.get("/api/threads", null, { signal: controller.signal })).rejects.toMatchObject({ kind: "cancelled" });
    await vi.advanceTimersByTimeAsync(1);
    controller.abort();
    await result;
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not send an already-cancelled request", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(api.get("/api/threads", null, { signal: controller.signal })).rejects.toMatchObject({ kind: "cancelled" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects malformed success JSON", async () => {
    fetchMock.mockResolvedValueOnce(new Response("<html>upstream error</html>"));
    await expect(api.get("/api/threads")).rejects.toMatchObject({ kind: "invalid-response", status: 200 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("handles a non-JSON HTTP error without losing its status", async () => {
    fetchMock.mockResolvedValueOnce(new Response("Forbidden", { status: 403 }));
    await expect(api.get("/api/threads")).rejects.toMatchObject({ kind: "http", status: 403 });
  });

  it("accepts an explicit 204 empty response", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await expect(api.delete("/api/bookmarks/example")).resolves.toBeUndefined();
  });

  const writes = [
    ["POST", () => api.post("/api/posts", { body: "synthetic" })],
    ["PATCH", () => api.patch("/api/users/me", { bio: "synthetic" })],
    ["PUT", () => api.put("/api/notifications/preferences", { likes: false })],
    ["DELETE", () => api.delete("/api/bookmarks/example")],
    ["DELETE with body", () => api.deleteWithBody("/api/users/me", { confirmation: "synthetic" })],
    ["upload", () => api.upload("/api/uploads/image", new Blob(["synthetic"], { type: "image/png" }))],
  ] as const;
  it.each(writes)("never replays %s after a dropped response (the write may have committed)", async (_name, write) => {
    fetchMock.mockRejectedValue(new TypeError("connection lost after commit"));
    await expect(write()).rejects.toMatchObject({ kind: "network" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("never replays a like toggle after a server error", async () => {
    fetchMock.mockResolvedValueOnce(unavailable());
    await expect(api.post("/api/threads/example/like", {})).rejects.toMatchObject({ status: 503 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("treats a write timeout as unconfirmed, not proof that nothing saved", async () => {
    fetchMock.mockImplementationOnce(pendingUntilAbort);
    const result = expect(api.post("/api/posts", { body: "synthetic" }, null, { timeoutMs: 1000 }))
      .rejects.toMatchObject({ kind: "timeout", message: expect.stringContaining("Check whether your change was saved") });
    await vi.advanceTimersByTimeAsync(1000);
    await result;
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("allows ordinary writes 30 seconds by default", async () => {
    fetchMock.mockImplementationOnce(pendingUntilAbort);
    const result = expect(api.post("/api/posts", { body: "synthetic" }))
      .rejects.toMatchObject({ kind: "timeout" });
    const signal = fetchMock.mock.calls[0][1]?.signal as AbortSignal;
    await vi.advanceTimersByTimeAsync(29_999);
    expect(signal.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await result;
  });

  it("allows uploads 60 seconds by default", async () => {
    fetchMock.mockImplementationOnce(pendingUntilAbort);
    const result = expect(api.upload("/api/uploads/image", new Blob(["synthetic"], { type: "image/png" })))
      .rejects.toMatchObject({ kind: "timeout" });
    const signal = fetchMock.mock.calls[0][1]?.signal as AbortSignal;
    await vi.advanceTimersByTimeAsync(59_999);
    expect(signal.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await result;
  });

  it("preserves JSON bodies and binary upload content types", async () => {
    fetchMock.mockImplementation(async () => ok());
    await api.post("/api/posts", { body: "synthetic" });
    expect(fetchMock.mock.calls[0][1]?.body).toBe(JSON.stringify({ body: "synthetic" }));
    const blob = new Blob(["synthetic"], { type: "image/png" });
    await api.upload("/api/uploads/image", blob);
    expect(fetchMock.mock.calls[1][1]?.body).toBe(blob);
    expect(fetchMock.mock.calls[1][1]?.headers).toMatchObject({ "Content-Type": "image/png" });
  });
});
