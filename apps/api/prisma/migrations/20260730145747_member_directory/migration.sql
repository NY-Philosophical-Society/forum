-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT,
    "googleId" TEXT,
    "appleId" TEXT,
    "displayName" TEXT NOT NULL,
    "avatarUrl" TEXT,
    "bio" TEXT,
    "verificationStatus" TEXT NOT NULL DEFAULT 'UNVERIFIED',
    "role" TEXT NOT NULL DEFAULT 'user',
    "bannedAt" DATETIME,
    "isSupporter" BOOLEAN NOT NULL DEFAULT false,
    "supporterSince" DATETIME,
    "directoryVisible" BOOLEAN NOT NULL DEFAULT false,
    "directoryBio" TEXT,
    "openToPartners" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_User" ("appleId", "avatarUrl", "bannedAt", "bio", "createdAt", "deletedAt", "displayName", "email", "googleId", "id", "isSupporter", "passwordHash", "role", "supporterSince", "verificationStatus") SELECT "appleId", "avatarUrl", "bannedAt", "bio", "createdAt", "deletedAt", "displayName", "email", "googleId", "id", "isSupporter", "passwordHash", "role", "supporterSince", "verificationStatus" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "User_googleId_key" ON "User"("googleId");
CREATE UNIQUE INDEX "User_appleId_key" ON "User"("appleId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
