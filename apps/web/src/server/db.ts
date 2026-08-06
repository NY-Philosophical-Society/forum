import "server-only";

import { PrismaClient } from "@prisma/client";

declare global {
  var forumPrisma: PrismaClient | undefined;
}

export const prisma = globalThis.forumPrisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") globalThis.forumPrisma = prisma;

/**
 * Case-insensitive substring match, for every user-facing search box.
 *
 * Postgres `LIKE` is case-sensitive, so a bare `{ contains: q }` quietly stops
 * matching "Plato" for a search of "plato" — the kind of regression that looks
 * like an empty result set rather than a bug. Every `contains` over text a
 * human typed goes through this; `mode: "insensitive"` is not optional here.
 */
export const containsInsensitive = (q: string) =>
  ({ contains: q, mode: "insensitive" }) as const;
