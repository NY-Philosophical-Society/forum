import "dotenv/config";
import cors from "cors";
import express from "express";
import { authRouter } from "./routes/auth";
import { messagesRouter } from "./routes/messages";
import { postsRouter } from "./routes/posts";
import { reportsRouter } from "./routes/reports";
import { tagsRouter } from "./routes/tags";
import { threadsRouter } from "./routes/threads";
import { usersRouter } from "./routes/users";
import { verificationRouter } from "./routes/verification";

// The app is built here, separate from index.ts's listen() call, so tests
// can drive it through supertest without binding a port.
export const app = express();

app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => res.json({ ok: true }));

app.use("/api/auth", authRouter);
app.use("/api/verification", verificationRouter);
app.use("/api/tags", tagsRouter);
app.use("/api/threads", threadsRouter);
app.use("/api/posts", postsRouter);
app.use("/api/messages", messagesRouter);
app.use("/api/users", usersRouter);
app.use("/api/reports", reportsRouter);
