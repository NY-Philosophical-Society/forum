// The separate Vercel showcase may opt into a browser-only review experience.
// This flag must remain unset on the club's forum deployment.
export const SHOWCASE_REVIEW_MODE = process.env.NEXT_PUBLIC_SHOWCASE_REVIEW_MODE === "true";
