-- AlterTable
ALTER TABLE "Post" ADD COLUMN "deletedAt" DATETIME;
ALTER TABLE "Post" ADD COLUMN "editedAt" DATETIME;

-- AlterTable
ALTER TABLE "Thread" ADD COLUMN "deletedAt" DATETIME;
ALTER TABLE "Thread" ADD COLUMN "editedAt" DATETIME;

-- CreateTable
CREATE TABLE "Mention" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "threadId" TEXT,
    "postId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Mention_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Mention_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Mention_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "Thread" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Mention_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Mention_userId_createdAt_idx" ON "Mention"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Mention_userId_threadId_key" ON "Mention"("userId", "threadId");

-- CreateIndex
CREATE UNIQUE INDEX "Mention_userId_postId_key" ON "Mention"("userId", "postId");
