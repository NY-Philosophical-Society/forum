import { Router } from "../router";
import { deregisterPushTokenSchema, registerPushTokenSchema } from "@nyps-forum/shared";
import { prisma } from "../db";
import { requireAuth } from "../guards";

export const pushTokensRouter = Router();

/**
 * Register this device's Expo push token. Upserted by token, not by user: a
 * device that logs into a different account moves with it, so pushes never
 * go to whoever used the phone previously.
 */
pushTokensRouter.post("/", requireAuth, async (req, res) => {
  const parsed = registerPushTokenSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }
  const { token, platform } = parsed.data;
  await prisma.pushToken.upsert({
    where: { token },
    update: { userId: req.user!.id, platform },
    create: { userId: req.user!.id, token, platform },
  });
  res.status(201).json({ ok: true });
});

/** Called on logout, before the session is dropped client-side. */
pushTokensRouter.delete("/", requireAuth, async (req, res) => {
  const parsed = deregisterPushTokenSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }
  await prisma.pushToken.deleteMany({
    where: { token: parsed.data.token, userId: req.user!.id },
  });
  res.json({ ok: true });
});
