import "server-only";

import { ApiApplication } from "./router";
import { adminRouter } from "./routes/admin";
import { authRouter } from "./routes/auth";
import { bookmarksRouter } from "./routes/bookmarks";
import { chaptersRouter } from "./routes/chapters";
import { directoryRouter } from "./routes/directory";
import { messagesRouter } from "./routes/messages";
import { notificationsRouter } from "./routes/notifications";
import { postsRouter } from "./routes/posts";
import { pushTokensRouter } from "./routes/push-tokens";
import { reportsRouter } from "./routes/reports";
import { searchRouter } from "./routes/search";
import { tagsRouter } from "./routes/tags";
import { threadsRouter } from "./routes/threads";
import { uploadsRouter } from "./routes/uploads";
import { usersRouter } from "./routes/users";
import { verificationRouter } from "./routes/verification";

export const apiApplication = new ApiApplication();

apiApplication.mount("/api/auth", authRouter);
apiApplication.mount("/api/verification", verificationRouter);
apiApplication.mount("/api/tags", tagsRouter);
apiApplication.mount("/api/threads", threadsRouter);
apiApplication.mount("/api/chapters", chaptersRouter);
apiApplication.mount("/api/directory", directoryRouter);
apiApplication.mount("/api/posts", postsRouter);
apiApplication.mount("/api/messages", messagesRouter);
apiApplication.mount("/api/notifications", notificationsRouter);
apiApplication.mount("/api/push-tokens", pushTokensRouter);
apiApplication.mount("/api/search", searchRouter);
apiApplication.mount("/api/bookmarks", bookmarksRouter);
apiApplication.mount("/api/uploads", uploadsRouter);
apiApplication.mount("/api/users", usersRouter);
apiApplication.mount("/api/reports", reportsRouter);
apiApplication.mount("/api/admin", adminRouter);
