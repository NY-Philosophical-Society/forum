import { Router } from "express";
import { createReportSchema } from "@nyps-forum/shared";
import { prisma } from "../db";
import { requireAdmin, requireAuth, requireVerified } from "../middleware/auth";
import { writeLimiter } from "../lib/rate-limit";

export const reportsRouter = Router();

reportsRouter.post("/", requireAuth, requireVerified, writeLimiter, async (req, res) => {
  const parsed = createReportSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }
  const { targetType, targetId, reason } = parsed.data;

  const report = await prisma.report.create({
    data: { reporterId: req.user!.id, targetType, targetId, reason },
  });

  res.status(201).json({ report: { id: report.id } });
});

/**
 * No admin dashboard yet — this just lists open reports for now. See
 * README for how to promote an account to "admin" in the meantime.
 */
reportsRouter.get("/", requireAuth, requireAdmin, async (_req, res) => {
  const reports = await prisma.report.findMany({
    where: { status: "open" },
    orderBy: { createdAt: "desc" },
  });

  res.json({
    reports: reports.map((r) => ({
      id: r.id,
      reporterId: r.reporterId,
      targetType: r.targetType,
      targetId: r.targetId,
      reason: r.reason,
      status: r.status,
      createdAt: r.createdAt.toISOString(),
    })),
  });
});
