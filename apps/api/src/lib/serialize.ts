import type { PublicUser } from "@nyps-forum/shared";
import { idVerificationRequired } from "../middleware/auth";

interface UserLike {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  bio: string | null;
  verificationStatus: string;
  role: string;
  isSupporter: boolean;
  createdAt: Date;
}

/**
 * Stand-in author for soft-deleted content. The empty id is deliberate:
 * exposing the real author of deleted content would undo the deletion, and
 * clients treat an empty id as "don't link to a profile".
 */
export const DELETED_AUTHOR: PublicUser = {
  id: "",
  displayName: "[deleted]",
  avatarUrl: null,
  bio: null,
  verificationStatus: "UNVERIFIED",
  canWrite: false,
  role: "user",
  isSupporter: false,
  createdAt: new Date(0).toISOString(),
};

export function toPublicUser(user: UserLike): PublicUser {
  return {
    id: user.id,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    bio: user.bio,
    verificationStatus: user.verificationStatus as PublicUser["verificationStatus"],
    canWrite: idVerificationRequired() ? user.verificationStatus === "VERIFIED" : true,
    role: user.role as PublicUser["role"],
    isSupporter: user.isSupporter,
    createdAt: user.createdAt.toISOString(),
  };
}
