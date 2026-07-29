import { describe, expect, it } from "vitest";
import { extractMentionUserIds, mentionMarkdown } from "./mentions";
import { stripMarkdown } from "./strip-markdown";

describe("stripMarkdown", () => {
  it("flattens formatting to prose", () => {
    expect(stripMarkdown("**bold** and *italic* and `code`")).toBe("bold and italic and code");
  });

  it("keeps link labels and drops URLs", () => {
    expect(stripMarkdown("see [the Republic](https://example.com/republic)")).toBe(
      "see the Republic",
    );
  });

  it("turns mention links into plain @names", () => {
    expect(stripMarkdown(mentionMarkdown("Ada Lovelace", "ckuser1"))).toBe("@Ada Lovelace");
  });

  it("replaces images with alt text or a placeholder", () => {
    expect(stripMarkdown("![diagram](http://x/a.jpg) then ![](http://x/b.jpg)")).toBe(
      "diagram then [image]",
    );
  });

  it("drops heading, quote, and list markers", () => {
    expect(stripMarkdown("# Title\n> quoted\n- item\n1. first")).toBe("Title quoted item first");
  });

  it("drops code fence markers but keeps the code", () => {
    expect(stripMarkdown("```js\nconst x = 1;\n```")).toBe("const x = 1;");
  });
});

describe("mention helpers", () => {
  it("round-trips through markdown", () => {
    const md = mentionMarkdown("Ada Lovelace", "ckuser1");
    expect(md).toBe("[@Ada Lovelace](/u/ckuser1)");
    expect(extractMentionUserIds(md)).toEqual(["ckuser1"]);
  });

  it("dedupes repeated mentions and ignores external links", () => {
    const md = "[@A](/u/id1) [@A](/u/id1) [@B](/u/id2) [x](https://e.com/u/id3)";
    expect(extractMentionUserIds(md)).toEqual(["id1", "id2"]);
  });

  it("strips brackets from display names so they can't break the link", () => {
    expect(mentionMarkdown("A] (B", "id1")).toBe("[@A B](/u/id1)");
  });
});
