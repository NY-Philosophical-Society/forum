import "dotenv/config";
import cors from "cors";
import express from "express";
import { LOCAL_UPLOADS_DIR, storageProvider } from "./lib/storage-provider";
import { adminRouter } from "./routes/admin";
import { authRouter } from "./routes/auth";
import { bookmarksRouter } from "./routes/bookmarks";
import { chaptersRouter } from "./routes/chapters";
import { directoryRouter } from "./routes/directory";
import { messagesRouter } from "./routes/messages";
import { notificationsRouter } from "./routes/notifications";
import { pushTokensRouter } from "./routes/push-tokens";
import { postsRouter } from "./routes/posts";
import { reportsRouter } from "./routes/reports";
import { searchRouter } from "./routes/search";
import { tagsRouter } from "./routes/tags";
import { threadsRouter } from "./routes/threads";
import { uploadsRouter } from "./routes/uploads";
import { usersRouter } from "./routes/users";
import { verificationRouter } from "./routes/verification";

// The app is built here, separate from index.ts's listen() call, so tests
// can drive it through supertest without binding a port.
export const app = express();

/**
 * CORS is a browser-only protection: it stops *other websites* from making
 * authenticated requests to this API using a visitor's logged-in session.
 * Native mobile apps are not browsers and are unaffected by any of this.
 *
 * In development, allow everything — the web app, Expo, and LAN IPs all move
 * around. In production, allow only the origins named in
 * CORS_ALLOWED_ORIGINS (comma-separated), so a hostile page can't ride along
 * on a member's session.
 *
 * Requests with no Origin header (mobile apps, curl, server-to-server) are
 * always allowed: they aren't browser requests, so there is no session for a
 * third-party page to abuse.
 */
const allowedOrigins = (process.env.CORS_ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

if (process.env.NODE_ENV === "production" && allowedOrigins.length === 0) {
  // Fail loudly rather than silently serving every origin in production.
  throw new Error(
    "CORS_ALLOWED_ORIGINS must be set in production — a comma-separated list " +
      "of the web app's origins (e.g. https://forum.nyphilosophy.org). " +
      "Leaving it unset would allow any website to call this API with a " +
      "member's credentials.",
  );
}

app.use(
  cors({
    origin(origin, callback) {
      if (!origin) return callback(null, true); // not a browser request
      if (process.env.NODE_ENV !== "production") return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      return callback(new Error(`Origin ${origin} is not allowed by CORS`));
    },
    credentials: true,
  }),
);
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
app.use("/api/chapters", chaptersRouter);
app.use("/api/directory", directoryRouter);
app.use("/api/posts", postsRouter);
app.use("/api/messages", messagesRouter);
app.use("/api/notifications", notificationsRouter);
app.use("/api/push-tokens", pushTokensRouter);
app.use("/api/search", searchRouter);
app.use("/api/bookmarks", bookmarksRouter);
app.use("/api/uploads", uploadsRouter);
app.use("/api/users", usersRouter);
app.use("/api/reports", reportsRouter);
app.use("/api/admin", adminRouter);
