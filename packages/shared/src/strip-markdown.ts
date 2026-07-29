/**
 * Reduces markdown to plain text for one-line previews (feed cards, profile
 * reply quotes, the anonymous thread teaser). Deliberately a light regex
 * pass, not a real parser — previews are truncated anyway, so "close to the
 * prose" beats "spec-perfect".
 */
export function stripMarkdown(markdown: string): string {
  return (
    markdown
      // Code fence markers go, their contents stay.
      .replace(/^```[^\n]*$/gm, "")
      // Images become their alt text (or a placeholder) — a preview line
      // should say an image exists, not render one.
      .replace(/!\[([^\]]*)\]\([^)]*\)/g, (_m, alt) => alt || "[image]")
      // Links (including @mention links) keep only their label.
      .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/^#{1,6}\s+/gm, "")
      .replace(/^(>\s?)+/gm, "")
      .replace(/^\s*[-*+]\s+/gm, "")
      .replace(/^\s*\d+\.\s+/gm, "")
      .replace(/(\*\*|__)([^*_]*)\1/g, "$2")
      .replace(/(\*|_)([^*_]*)\1/g, "$2")
      .replace(/`([^`]*)`/g, "$1")
      .replace(/\s+/g, " ")
      .trim()
  );
}
