import "dotenv/config";
import cors from "cors";
import express from "express";
import { LOCAL_UPLOADS_DIR, storageProvider } from "./lib/storage-provider";
import { authRouter } from "./routes/auth";
import { messagesRouter } from "./routes/messages";
import { notificationsRouter } from "./routes/notifications";
import { pushTokensRouter } from "./routes/push-tokens";
import { postsRouter } from "./routes/posts";
import { reportsRouter } from "./routes/reports";
import { tagsRouter } from "./routes/tags";
import { threadsRouter } from "./routes/threads";
import { uploadsRouter } from "./routes/uploads";
import { usersRouter } from "./routes/users";
import { verificationRouter } from "./routes/verification";

// The app is built here, separate from index.ts's listen() call, so tests
// can drive it through supertest without binding a port.
export const app = express();

app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => res.json({ ok: true }));

// The local storage stub keeps uploads on disk and the API serves them
// itself; a real S3/R2 bucket serves its own URLs, so this only mounts for
// the stub.
if (storageProvider.name === "local") {
  app.use(
    "/uploads",
    express.static(LOCAL_UPLOADS_DIR, { maxAge: "365d", immutable: true, fallthrough: false }),
  );
}

app.use("/api/auth", authRouter);
app.use("/api/verification", verificationRouter);
app.use("/api/tags", tagsRouter);
app.use("/api/threads", threadsRouter);
app.use("/api/posts", postsRouter);
app.use("/api/messages", messagesRouter);
app.use("/api/notifications", notificationsRouter);
app.use("/api/push-tokens", pushTokensRouter);
app.use("/api/uploads", uploadsRouter);
app.use("/api/users", usersRouter);
app.use("/api/reports", reportsRouter);
