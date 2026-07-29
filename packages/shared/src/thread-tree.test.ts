import { describe, expect, it } from "vitest";
import { flattenPostTree } from "./thread-tree";
import type { Post, PublicUser } from "./types";

const author: PublicUser = {
  id: "u1",
  displayName: "Test Author",
  avatarUrl: null,
  bio: null,
  verificationStatus: "VERIFIED",
  role: "user",
  isSupporter: false,
  createdAt: "2026-01-01T00:00:00.000Z",
};

let counter = 0;
function post(id: string, parentId: string | null): Post {
  counter += 1;
  return {
    id,
    threadId: "t1",
    parentId,
    body: `body of ${id}`,
    author,
    createdAt: `2026-01-01T00:00:${String(counter).padStart(2, "0")}.000Z`,
    editedAt: null,
    deleted: false,
    likeCount: 0,
    myLiked: false,
  };
}

describe("flattenPostTree", () => {
  it("returns an empty list for no posts", () => {
    expect(flattenPostTree([])).toEqual([]);
  });

  it("keeps a flat list of top-level posts in input order at depth 0", () => {
    const posts = [post("a", null), post("b", null), post("c", null)];
    const flat = flattenPostTree(posts);
    expect(flat.map((p) => p.id)).toEqual(["a", "b", "c"]);
    expect(flat.map((p) => p.depth)).toEqual([0, 0, 0]);
  });

  it("orders depth-first: each reply immediately follows its parent branch", () => {
    // Input is flat createdAt order (the API's posts ordering):
    //   a, b top-level; a1, b1 replies; a1x a grandchild of a.
    const posts = [
      post("a", null),
      post("b", null),
      post("a1", "a"),
      post("b1", "b"),
      post("a1x", "a1"),
    ];
    const flat = flattenPostTree(posts);
    expect(flat.map((p) => p.id)).toEqual(["a", "a1", "a1x", "b", "b1"]);
  });

  it("assigns depth = number of ancestors", () => {
    const posts = [post("root", null), post("child", "root"), post("grand", "child"), post("great", "grand")];
    const flat = flattenPostTree(posts);
    expect(flat.map((p) => [p.id, p.depth])).toEqual([
      ["root", 0],
      ["child", 1],
      ["grand", 2],
      ["great", 3],
    ]);
  });

  it("keeps siblings in input (createdAt) order at every depth", () => {
    const posts = [
      post("a", null),
      post("a1", "a"),
      post("a2", "a"),
      post("a3", "a"),
      post("a2x", "a2"),
    ];
    const flat = flattenPostTree(posts);
    expect(flat.map((p) => p.id)).toEqual(["a", "a1", "a2", "a2x", "a3"]);
  });

  it("never orphans a nested reply: every non-root post appears after its parent", () => {
    // Deliberately interleaved input order across two big branches.
    const posts = [
      post("a", null),
      post("b", null),
      post("b1", "b"),
      post("a1", "a"),
      post("a1x", "a1"),
      post("b1x", "b1"),
      post("a1xx", "a1x"),
      post("b2", "b"),
    ];
    const flat = flattenPostTree(posts);
    expect(flat).toHaveLength(posts.length);
    const positions = new Map(flat.map((p, i) => [p.id, i]));
    for (const p of posts) {
      if (p.parentId !== null) {
        expect(positions.get(p.id)!).toBeGreaterThan(positions.get(p.parentId)!);
      }
    }
  });

  it("preserves every field of the input posts", () => {
    const original = post("solo", null);
    const [flat] = flattenPostTree([original]);
    const { depth, ...rest } = flat;
    expect(depth).toBe(0);
    expect(rest).toEqual(original);
  });
});
