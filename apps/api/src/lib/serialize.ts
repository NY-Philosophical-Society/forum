import type { PublicUser } from "@nyps-forum/shared";

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

export function toPublicUser(user: UserLike): PublicUser {
  return {
    id: user.id,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    bio: user.bio,
    verificationStatus: user.verificationStatus as PublicUser["verificationStatus"],
    role: user.role as PublicUser["role"],
    isSupporter: user.isSupporter,
    createdAt: user.createdAt.toISOString(),
  };
}
