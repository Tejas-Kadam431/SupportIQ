import express from "express";
import cookieParser from "cookie-parser";
import request from "supertest";
import { prisma } from "../config/prisma.js";
import { authRoutes } from "../modules/auth/auth.routes.js";
import { loginUser, refreshAccessToken, logoutUser } from "../modules/auth/auth.service.js";
import { hashPassword } from "../common/utils/password.js";
import { hashRefreshToken } from "../common/utils/refreshToken.js";
import { assignTicket, updateTicketStatus, getTicketDetails } from "../modules/tickets/ticket.service.js";
import { removeOrganizationMember, updateOrganizationMemberRole } from "../modules/organizations/org.service.js";
import type { Role } from "@prisma/client";

// Real PostgreSQL fixtures; no Prisma/transaction mocks. CI supplies an isolated DB.
const suffix = `stage-c-${Date.now()}-${Math.random().toString(16).slice(2)}`;
const password = "StageC-password-123";
let passwordHash: string;
const userIds: string[] = [];
const orgIds: string[] = [];
const app = express();
app.use(express.json(), cookieParser());
app.use("/auth", authRoutes);
app.use((error: { statusCode?: number; message: string }, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  res.status(error.statusCode ?? 500).json({ message: error.statusCode ? error.message : "Internal server error" });
});
const cookie = (res: request.Response) => (res.headers["set-cookie"] as unknown as string[])[0].split(";")[0];
const rawCookie = (res: request.Response) => cookie(res).split("=")[1];

async function makeUser() {
  const user = await prisma.user.create({ data: { name: "Stage C", email: `${userIds.length}-${suffix}@test.invalid`, passwordHash } });
  userIds.push(user.id);
  return user;
}
async function fixture() {
  const [owner, admin, agent, customer, outsider] = await Promise.all(Array.from({ length: 5 }, async (_, i) => {
    const user = await prisma.user.create({ data: { name: `Member ${i}`, email: `${orgIds.length}-${i}-${suffix}@fixture.invalid`, passwordHash } });
    userIds.push(user.id); return user;
  }));
  const org = await prisma.organization.create({ data: { name: "Stage C", slug: `${orgIds.length}-${suffix}`, ownerId: owner.id } });
  orgIds.push(org.id);
  const members = await Promise.all([owner, admin, agent, customer].map((user, i) => prisma.organizationMember.create({
    data: { organizationId: org.id, userId: user.id, role: (["OWNER", "ADMIN", "AGENT", "CUSTOMER"] as Role[])[i] }
  })));
  const ticket = await prisma.ticket.create({ data: { organizationId: org.id, customerId: customer.id, title: "Help", description: "Fixture" } });
  return { owner, admin, agent, customer, outsider, org, members, ticket };
}
beforeAll(async () => { passwordHash = await hashPassword(password); });
afterAll(async () => {
  await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.$disconnect();
});

describe("refresh families in PostgreSQL", () => {
  test("login, rotation, reuse, descendant denial and unrelated-session isolation", async () => {
    const user = await makeUser();
    const login = await request(app).post("/auth/login").send({ email: user.email, password }).expect(200);
    expect(login.body.data.refreshToken).toBeUndefined();
    const raw = rawCookie(login);
    const stored = await prisma.refreshToken.findFirstOrThrow({ where: { tokenHash: hashRefreshToken(raw) }, include: { session: true } });
    expect(stored.session?.userId).toBe(user.id);
    expect(JSON.stringify(stored)).not.toContain(raw);
    const other = await loginUser({ email: user.email, password });
    const rotated = await request(app).post("/auth/refresh").set("Cookie", cookie(login)).send({}).expect(200);
    const replacement = await prisma.refreshToken.findFirstOrThrow({ where: { tokenHash: hashRefreshToken(rawCookie(rotated)) } });
    expect(replacement.sessionId).toBe(stored.sessionId);
    expect(replacement.expiresAt).toEqual(stored.session!.expiresAt);
    await request(app).post("/auth/refresh").set("Cookie", cookie(login)).send({}).expect(401);
    expect((await prisma.refreshSession.findUniqueOrThrow({ where: { id: stored.sessionId! } })).revokeReason).toBe("REUSE_DETECTED");
    await request(app).post("/auth/refresh").set("Cookie", cookie(rotated)).send({}).expect(401);
    await expect(refreshAccessToken(other.refreshToken)).resolves.toHaveProperty("accessToken");
  });

  test("concurrent same-token rotation has one winner but invalidates its replacement", async () => {
    const user = await makeUser();
    const initial = await loginUser({ email: user.email, password });
    const results = await Promise.allSettled([refreshAccessToken(initial.refreshToken), refreshAccessToken(initial.refreshToken)]);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    const winner = results.find(result => result.status === "fulfilled") as PromiseFulfilledResult<Awaited<ReturnType<typeof refreshAccessToken>>>;
    await expect(refreshAccessToken(winner.value.refreshToken)).rejects.toMatchObject({ statusCode: 401 });
  });

  test("logout revokes only that session, clears cookie, and accepts an older consumed token", async () => {
    const user = await makeUser();
    const initial = await loginUser({ email: user.email, password });
    const other = await loginUser({ email: user.email, password });
    const rotated = await refreshAccessToken(initial.refreshToken);
    const response = await request(app).post("/auth/logout").set("Cookie", `supportiq_refresh_token=${initial.refreshToken}`).send({}).expect(200);
    expect(response.headers["set-cookie"][0]).toContain("Expires=Thu, 01 Jan 1970");
    await expect(refreshAccessToken(rotated.refreshToken)).rejects.toMatchObject({ statusCode: 401 });
    await expect(refreshAccessToken(other.refreshToken)).resolves.toHaveProperty("accessToken");
  });

  test.each(["unknown", "malformed", "legacy", "token-expired", "session-expired", "revoked"])("denies %s credentials with generic 401", async kind => {
    const user = await makeUser();
    const initial = await loginUser({ email: user.email, password });
    const token = await prisma.refreshToken.findFirstOrThrow({ where: { tokenHash: hashRefreshToken(initial.refreshToken) } });
    let raw = initial.refreshToken;
    if (kind === "unknown") raw = "f".repeat(128);
    if (kind === "malformed") raw = "not-a-token";
    if (kind === "legacy") await prisma.refreshToken.update({ where: { id: token.id }, data: { sessionId: null } });
    if (kind === "token-expired") await prisma.refreshToken.update({ where: { id: token.id }, data: { expiresAt: new Date(0) } });
    if (kind === "session-expired") await prisma.refreshSession.update({ where: { id: token.sessionId! }, data: { expiresAt: new Date(0) } });
    if (kind === "revoked") await logoutUser(raw);
    const response = await request(app).post("/auth/refresh").set("Cookie", `supportiq_refresh_token=${raw}`).send({}).expect(401);
    expect(response.body).toEqual({ message: "Invalid or expired refresh token" });
  });

  test("production cookie remains HttpOnly, Secure, SameSite=None, Path=/ with bounded lifetime", async () => {
    const user = await makeUser();
    const old = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      const response = await request(app).post("/auth/login").send({ email: user.email, password }).expect(200);
      const header = response.headers["set-cookie"][0];
      for (const attribute of ["HttpOnly", "Secure", "SameSite=None", "Path=/"]) expect(header).toContain(attribute);
      const maxAge = Number(/Max-Age=(\d+)/.exec(header)![1]);
      expect(maxAge).toBeLessThanOrEqual(604800); expect(maxAge).toBeGreaterThan(604790);
      expect(response.body.data.refreshToken).toBeUndefined();
    } finally { process.env.NODE_ENV = old; }
  });

  test("replacement INSERT failure rolls back the consume UPDATE", async () => {
    const user = await makeUser();
    const initial = await loginUser({ email: user.email, password });
    const token = await prisma.refreshToken.findFirstOrThrow({ where: { tokenHash: hashRefreshToken(initial.refreshToken) } });
    await prisma.$executeRawUnsafe(`CREATE FUNCTION stage_c_fail_refresh() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected replacement failure'; END $$`);
    await prisma.$executeRawUnsafe(`CREATE TRIGGER stage_c_fail_refresh BEFORE INSERT ON "RefreshToken" FOR EACH ROW EXECUTE FUNCTION stage_c_fail_refresh()`);
    try {
      await expect(refreshAccessToken(initial.refreshToken)).rejects.toThrow();
      const saved = await prisma.refreshToken.findUniqueOrThrow({ where: { id: token.id } });
      expect(saved.consumedAt).toBeNull(); expect(saved.revokedAt).toBeNull();
    } finally {
      await prisma.$executeRawUnsafe(`DROP TRIGGER stage_c_fail_refresh ON "RefreshToken"`);
      await prisma.$executeRawUnsafe(`DROP FUNCTION stage_c_fail_refresh()`);
    }
    await expect(refreshAccessToken(initial.refreshToken)).resolves.toHaveProperty("accessToken");
  });
});

describe("membership and assignment in PostgreSQL", () => {
  test("only OWNER/ADMIN assign current staff; tenant and customer boundaries hold", async () => {
    const f = await fixture();
    for (const actor of [f.owner, f.admin]) {
      const saved = await assignTicket(actor.id, f.ticket.id, { assigneeId: f.agent.id });
      expect(saved.assigneeId).toBe(f.agent.id); expect(saved.status).toBe("OPEN");
    }
    for (const actor of [f.agent, f.customer, f.outsider]) {
      await expect(assignTicket(actor.id, f.ticket.id, { assigneeId: f.agent.id })).rejects.toMatchObject({ statusCode: 403 });
    }
    for (const assignee of [f.customer, f.outsider]) {
      await expect(assignTicket(f.owner.id, f.ticket.id, { assigneeId: assignee.id })).rejects.toMatchObject({ statusCode: 400 });
    }
    expect((await getTicketDetails(f.agent.id, f.ticket.id)).canAssign).toBe(false);
    expect((await getTicketDetails(f.admin.id, f.ticket.id)).canAssign).toBe(true);
    const other = await fixture();
    await expect(assignTicket(f.owner.id, f.ticket.id, { assigneeId: other.agent.id })).rejects.toMatchObject({ statusCode: 400 });
    await expect(assignTicket(other.owner.id, f.ticket.id, { assigneeId: other.agent.id })).rejects.toMatchObject({ statusCode: 403 });
    await expect(getTicketDetails(other.customer.id, f.ticket.id)).rejects.toMatchObject({ statusCode: 403 });
    const history = await prisma.activityLog.findMany({ where: { ticketId: f.ticket.id }, orderBy: { createdAt: "asc" } });
    expect(history[0].metadata).toEqual({ oldAssigneeId: null, newAssigneeId: f.agent.id, reason: "MANUAL_ASSIGNMENT" });
    expect(history[1].metadata).toEqual({ oldAssigneeId: f.agent.id, newAssigneeId: f.agent.id, reason: "MANUAL_REASSIGNMENT" });
    expect(history[0].message).toContain(f.agent.name);
  });

  test.each(["remove", "demote"])("%s clears active assignments atomically, preserves history and cleans on reopen", async operation => {
    const f = await fixture();
    const active = await Promise.all((["OPEN", "IN_PROGRESS", "WAITING"] as const).map(status => prisma.ticket.create({ data: {
      organizationId: f.org.id, customerId: f.customer.id, assigneeId: f.agent.id, title: status, description: "Fixture", status
    } })));
    const historical = await Promise.all((["RESOLVED", "CLOSED"] as const).map(status => prisma.ticket.create({ data: {
      organizationId: f.org.id, customerId: f.customer.id, assigneeId: f.agent.id, title: status, description: "Fixture", status
    } })));
    if (operation === "remove") await removeOrganizationMember(f.admin.id, f.org.id, f.members[2].id);
    else await updateOrganizationMemberRole(f.owner.id, f.org.id, f.members[2].id, { role: "CUSTOMER" });
    for (const ticket of active) {
      expect(await prisma.ticket.findUnique({ where: { id: ticket.id } })).toMatchObject({ assigneeId: null, status: ticket.status });
      const log = await prisma.activityLog.findFirstOrThrow({ where: { ticketId: ticket.id } });
      expect(log.metadata).toEqual({ oldAssigneeId: f.agent.id, newAssigneeId: null, reason: operation === "remove" ? "MEMBER_REMOVED" : "ROLE_BECAME_INELIGIBLE" });
    }
    for (const ticket of historical) {
      expect((await prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id } })).assigneeId).toBe(f.agent.id);
      expect(await updateTicketStatus(f.owner.id, ticket.id, { status: "OPEN" })).toMatchObject({ assigneeId: null, status: "OPEN" });
    }
    await expect(assignTicket(f.owner.id, f.ticket.id, { assigneeId: f.agent.id })).rejects.toMatchObject({ statusCode: 400 });
  });

  test("eligible role changes retain assignments; owner and cross-tenant mutations remain protected", async () => {
    const f = await fixture();
    await assignTicket(f.owner.id, f.ticket.id, { assigneeId: f.agent.id });
    for (const role of ["ADMIN", "AGENT"] as const) {
      await updateOrganizationMemberRole(f.owner.id, f.org.id, f.members[2].id, { role });
      expect((await prisma.ticket.findUniqueOrThrow({ where: { id: f.ticket.id } })).assigneeId).toBe(f.agent.id);
    }
    await expect(removeOrganizationMember(f.owner.id, f.org.id, f.members[0].id)).rejects.toMatchObject({ statusCode: 403 });
    await expect(updateOrganizationMemberRole(f.owner.id, f.org.id, f.members[0].id, { role: "CUSTOMER" })).rejects.toMatchObject({ statusCode: 403 });
    await expect(removeOrganizationMember(f.outsider.id, f.org.id, f.members[2].id)).rejects.toMatchObject({ statusCode: 403 });
    const other = await fixture();
    await expect(removeOrganizationMember(f.owner.id, f.org.id, other.members[2].id)).rejects.toMatchObject({ statusCode: 404 });
  });

  test("audit INSERT failure rolls back cleanup and membership mutation", async () => {
    const f = await fixture();
    await assignTicket(f.owner.id, f.ticket.id, { assigneeId: f.agent.id });
    await prisma.$executeRawUnsafe(`CREATE FUNCTION stage_c_fail_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected audit failure'; END $$`);
    await prisma.$executeRawUnsafe(`CREATE TRIGGER stage_c_fail_audit BEFORE INSERT ON "ActivityLog" FOR EACH ROW EXECUTE FUNCTION stage_c_fail_audit()`);
    try {
      await expect(removeOrganizationMember(f.owner.id, f.org.id, f.members[2].id)).rejects.toThrow();
      await expect(updateOrganizationMemberRole(f.owner.id, f.org.id, f.members[2].id, { role: "CUSTOMER" })).rejects.toThrow();
      expect((await prisma.organizationMember.findUniqueOrThrow({ where: { id: f.members[2].id } })).role).toBe("AGENT");
      expect((await prisma.ticket.findUniqueOrThrow({ where: { id: f.ticket.id } })).assigneeId).toBe(f.agent.id);
      expect(await prisma.activityLog.count({ where: { ticketId: f.ticket.id } })).toBe(1);
    } finally {
      await prisma.$executeRawUnsafe(`DROP TRIGGER stage_c_fail_audit ON "ActivityLog"`);
      await prisma.$executeRawUnsafe(`DROP FUNCTION stage_c_fail_audit()`);
    }
  });

  test.each(["remove", "demote"])("assignment racing with %s cannot commit an invalid active assignment", async operation => {
    const f = await fixture();
    // Hold the organization lock until BOTH service transactions wait on locks.
    let unlock!: () => void;
    let locked!: () => void;
    const gate = new Promise<void>(resolve => { unlock = resolve; });
    const ready = new Promise<void>(resolve => { locked = resolve; });
    const blocker = prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "Organization" WHERE "id" = ${f.org.id} FOR UPDATE`;
      locked(); await gate;
    }, { timeout: 15000 });
    await ready;
    const assign = assignTicket(f.owner.id, f.ticket.id, { assigneeId: f.agent.id });
    const mutate = operation === "remove"
      ? removeOrganizationMember(f.owner.id, f.org.id, f.members[2].id)
      : updateOrganizationMemberRole(f.owner.id, f.org.id, f.members[2].id, { role: "CUSTOMER" });
    const finished = Promise.allSettled([assign, mutate]);
    try {
      const deadline = Date.now() + 3000;
      let waiting = 0;
      while (Date.now() < deadline && waiting < 2) {
        const rows = await prisma.$queryRaw<Array<{ count: bigint }>>`SELECT count(*) FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock'`;
        waiting = Number(rows[0].count);
        if (waiting < 2) await new Promise(resolve => setTimeout(resolve, 10));
      }
      expect(waiting).toBeGreaterThanOrEqual(2);
    } finally { unlock(); await blocker; }
    const results = await finished;
    expect(results[1].status).toBe("fulfilled");
    if (results[0].status === "rejected") expect(results[0].reason.statusCode).toBe(400);
    expect((await prisma.ticket.findUniqueOrThrow({ where: { id: f.ticket.id } })).assigneeId).toBeNull();
  });
});
