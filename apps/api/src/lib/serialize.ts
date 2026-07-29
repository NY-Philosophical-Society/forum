import type { PublicUser } from "@nyps-forum/shared";

interface UserLike {
  id: string;
  displayName: string;
  verificationStatus: string;
  role: string;
  isSupporter: boolean;
  createdAt: Date;
}

export function toPublicUser(user: UserLike): PublicUser {
  return {
    id: user.id,
    displayName: user.displayName,
    verificationStatus: user.verificationStatus as PublicUser["verificationStatus"],
    role: user.role as PublicUser["role"],
    isSupporter: user.isSupporter,
    createdAt: user.createdAt.toISOString(),
  };
}
