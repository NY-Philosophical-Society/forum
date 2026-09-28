import { describe, expect, it } from "vitest";
import request from "./test/request";
import { app } from "./app";
import { prisma } from "./db";
import { applyVerifiedDonationEvent, type VerifiedDonationEvent } from "./access-grants";
import { promoteToAdmin, signup, type TestUser } from "./test/helpers";

const policy = { minAmountMinor: 1000, currency: "USD" };

async function staff() {
  const admin = await signup("access-admin");
  await promoteToAdmin(admin.id);
  return admin;
}

function asAdmin(admin: TestUser, userId: string, path: string, body: unknown) {
  return request(app).post(`/api/users/${userId}/${path}`)
    .set("Authorization", `Bearer ${admin.token}`).send(body);
}

function event(userId: string, donationId: string, type: VerifiedDonationEvent["type"], eventId: string): VerifiedDonationEvent {
  return { provider: "test_provider", userId, donationId, type, eventId, amountMinor: 1500, currency: "USD" };
}

describe("donation-backed forum access and formal membership", () => {
  it("requires a club admin and an audit reason for formal membership changes", async () => {
    const admin = await staff();
    const member = await signup("formal-guard");
    const body = { isSocietyMember: true, reason: "Checked club register" };
    expect((await request(app).post(`/api/users/${member.id}/society-membership`).send(body)).status).toBe(401);
    expect((await asAdmin(member, member.id, "society-membership", body)).status).toBe(403);
    expect((await asAdmin(admin, member.id, "society-membership", { isSocietyMember: true })).status).toBe(400);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: member.id } })).isSocietyMember).toBe(false);
  });

  it("keeps formal membership separate from donation-backed access", async () => {
    const admin = await staff();
    const member = await signup("formal-member");
    const donation = await applyVerifiedDonationEvent(event(member.id, "gift-1", "settled", "event-1"), policy);
    expect(donation).toBe("applied");
    let row = await prisma.user.findUniqueOrThrow({ where: { id: member.id } });
    expect(row.isSupporter).toBe(true);
    expect(row.isSocietyMember).toBe(false);

    const formal = await asAdmin(admin, member.id, "society-membership", {
      isSocietyMember: true,
      reason: "Checked against the club membership register",
    });
    expect(formal.status).toBe(200);
    expect(formal.body.user).toMatchObject({ isSupporter: true, isSocietyMember: true });

    await applyVerifiedDonationEvent(event(member.id, "gift-1", "reversed", "event-2"), policy);
    row = await prisma.user.findUniqueOrThrow({ where: { id: member.id } });
    expect(row.isSupporter).toBe(false);
    expect(row.isSocietyMember).toBe(true);

    const revoke = await asAdmin(admin, member.id, "society-membership", {
      isSocietyMember: false,
      reason: "Membership ended according to club register",
    });
    expect(revoke.status).toBe(200);
    expect(revoke.body.user).toMatchObject({ isSupporter: false, isSocietyMember: false });
    const log = await prisma.moderationLog.findMany({ where: { targetId: member.id } });
    expect(log.map((entry) => entry.action)).toEqual(expect.arrayContaining([
      "society_member_granted", "society_member_revoked",
    ]));
  });

  it("deduplicates events and never restores a reversed donation from a late settlement", async () => {
    const member = await signup("donation-order");
    const reversed = event(member.id, "gift-reversed-first", "reversed", "reverse-first");
    expect(await applyVerifiedDonationEvent(reversed, policy)).toBe("applied");
    expect(await applyVerifiedDonationEvent(reversed, policy)).toBe("duplicate");
    expect(await applyVerifiedDonationEvent(event(member.id, "gift-reversed-first", "settled", "settled-late"), policy)).toBe("applied");
    expect((await prisma.user.findUniqueOrThrow({ where: { id: member.id } })).isSupporter).toBe(false);
    expect(await prisma.donationEvent.count({ where: { provider: "test_provider", donationId: "gift-reversed-first" } })).toBe(2);
  });

  it("keeps access after one refund if another eligible gift remains, then honors staff override", async () => {
    const admin = await staff();
    const member = await signup("multiple-gifts");
    await applyVerifiedDonationEvent(event(member.id, "gift-a", "settled", "event-a"), policy);
    await applyVerifiedDonationEvent(event(member.id, "gift-b", "settled", "event-b"), policy);
    await applyVerifiedDonationEvent(event(member.id, "gift-a", "reversed", "event-a-refund"), policy);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: member.id } })).isSupporter).toBe(true);

    const manualRevoke = await asAdmin(admin, member.id, "supporter", {
      isSupporter: false,
      reason: "Staff review blocks access pending investigation",
    });
    expect(manualRevoke.status).toBe(200);
    expect(manualRevoke.body.user.isSupporter).toBe(false);
    await applyVerifiedDonationEvent(event(member.id, "gift-c", "settled", "event-c"), policy);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: member.id } })).isSupporter).toBe(false);

    const restore = await asAdmin(admin, member.id, "supporter", {
      isSupporter: true,
      reason: "Staff review completed and access approved",
    });
    expect(restore.body.user.isSupporter).toBe(true);
  });

  it("fails closed for ineligible gifts and conflicting references", async () => {
    const first = await signup("donor-first");
    const second = await signup("donor-second");
    const tooSmall = { ...event(first.id, "small-gift", "settled", "small-event"), amountMinor: 100 };
    expect(await applyVerifiedDonationEvent(tooSmall, policy)).toBe("ineligible");
    expect((await prisma.user.findUniqueOrThrow({ where: { id: first.id } })).isSupporter).toBe(false);

    const valid = event(first.id, "bound-gift", "settled", "bound-event");
    await applyVerifiedDonationEvent(valid, policy);
    await expect(applyVerifiedDonationEvent({ ...valid, userId: second.id, eventId: "bound-other" }, policy))
      .rejects.toThrow("another account");
    await expect(applyVerifiedDonationEvent({ ...valid, amountMinor: 2000 }, policy))
      .rejects.toThrow("reused with different data");
    expect(await prisma.donationEvent.count({ where: { donationId: "bound-gift" } })).toBe(1);
  });
});
