import "dotenv/config";
import cors from "cors";
import express from "express";
import { authRouter } from "./routes/auth";
import { messagesRouter } from "./routes/messages";
import { postsRouter } from "./routes/posts";
import { tagsRouter } from "./routes/tags";
import { threadsRouter } from "./routes/threads";
import { usersRouter } from "./routes/users";
import { verificationRouter } from "./routes/verification";

const app = express();

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

const port = Number(process.env.PORT ?? 4000);
app.listen(port, () => {
  console.log(`API listening on http://localhost:${port}`);
});
