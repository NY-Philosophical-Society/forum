import type { DirectoryResponse } from "@nyps-forum/shared";
import { z } from "zod";
import { api, ApiError, type ApiRequestOptions } from "~/lib/api";
import { publicUserSchema } from "./forum-api";

const chapterRefSchema = z.object({ id: z.string(), slug: z.string(), name: z.string() });
const directoryResponseSchema = z.object({
  entries: z.array(z.object({
    user: publicUserSchema,
    directoryBio: z.string().nullable(),
    openToPartners: z.boolean(),
    chapters: z.array(chapterRefSchema),
  })),
  total: z.number().int().nonnegative(),
  limit: z.number().int().positive(),
  offset: z.number().int().nonnegative(),
  hasMore: z.boolean(),
});

export type DirectoryQuery = { q?: string; partners?: boolean; limit?: number; offset?: number };

export const memberApi = {
  async directory(query: DirectoryQuery, token: string, options?: ApiRequestOptions): Promise<DirectoryResponse> {
    const params = new URLSearchParams({
      limit: String(query.limit ?? 30),
      offset: String(query.offset ?? 0),
    });
    if (query.q?.trim()) params.set("q", query.q.trim());
    if (query.partners) params.set("partners", "1");
    const result = directoryResponseSchema.safeParse(await api.get<unknown>(`/api/directory?${params}`, token, options));
    if (!result.success) throw new ApiError("The member directory returned data this version cannot safely display.", "invalid-response");
    return result.data;
  },
};
