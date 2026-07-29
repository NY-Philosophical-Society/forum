import type { PublicUser } from "@nyps-forum/shared";

interface UserLike {
  id: string;
  displayName: string;
  verificationStatus: string;
  createdAt: Date;
}

export function toPublicUser(user: UserLike): PublicUser {
  return {
    id: user.id,
    displayName: user.displayName,
    verificationStatus: user.verificationStatus as PublicUser["verificationStatus"],
    createdAt: user.createdAt.toISOString(),
  };
}
