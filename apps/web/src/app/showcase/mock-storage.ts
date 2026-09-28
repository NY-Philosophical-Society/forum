// Only keys created by earlier showcase prototypes. Supabase Auth and every
// other localStorage namespace are deliberately outside this cleanup.
export const RETIRED_SHOWCASE_KEYS = [
  "nypc-showcase-v3",
  "nypc-showcase-v2",
  "nyps-showcase-rsvps",
  "nyps-showcase-follows",
] as const;

export function clearRetiredShowcaseData(storage: Pick<Storage, "removeItem">): void {
  for (const key of RETIRED_SHOWCASE_KEYS) storage.removeItem(key);
}
