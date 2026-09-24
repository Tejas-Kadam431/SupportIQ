import request from "supertest";
import { app } from "../app.js";
import { prisma } from "../config/prisma.js";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { io as connectSocket } from "socket.io-client";
import { initRealtimeServer, emitTicketMessageCreated } from "../modules/realtime/realtime.service.js";

type TestUser = {
  id: string;
  name: string;
  email: string;
  accessToken: string;
};

const password = "password123";
const runId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;

function authHeader(user: TestUser) {
  return {
    Authorization: `Bearer ${user.accessToken}`
  };
}

async function registerUser(name: string, roleLabel: string): Promise<TestUser> {
  const email = `${roleLabel}.${runId}@test.com`;

  const response = await request(app)
    .post("/api/v1/auth/register")
    .send({
      name,
      email,
      password
    })
    .expect(201);

  return {
    id: response.body.data.user.id,
    name: response.body.data.user.name,
    email: response.body.data.user.email,
    accessToken: response.body.data.accessToken
  };
}

async function createOrganization(owner: TestUser) {
  const response = await request(app)
    .post("/api/v1/organizations")
    .set(authHeader(owner))
    .send({
      name: `RBAC Test Org ${runId}`
    })
    .expect(201);

  return response.body.data.organization;
}

async function addMember(
  actor: TestUser,
  orgId: string,
  email: string,
  role: "ADMIN" | "AGENT" | "CUSTOMER"
) {
  const response = await request(app)
    .post(`/api/v1/organizations/${orgId}/members`)
    .set(authHeader(actor))
    .send({
      email,
      role
    })
    .expect(201);

  return response.body.data.member;
}

async function createTicket(actor: TestUser, orgId: string) {
  const response = await request(app)
    .post(`/api/v1/organizations/${orgId}/tickets`)
    .set(authHeader(actor))
    .send({
      title: "Customer cannot reset password",
      description:
        "Customer requested a password reset email but did not receive it after checking spam.",
      priority: "HIGH"
    })
    .expect(201);

  return response.body.data.ticket;
}

describe("SupportIQ RBAC integration", () => {
  let owner: TestUser;
  let admin: TestUser;
  let agent: TestUser;
  let customer: TestUser;
  let otherCustomer: TestUser;
  let orgId: string;
  let ownerMembershipId: string;
  let agentMembershipId: string;
  let ticketId: string;

  beforeAll(async () => {
    owner = await registerUser("RBAC Owner", "owner");
    admin = await registerUser("RBAC Admin", "admin");
    agent = await registerUser("RBAC Agent", "agent");
    customer = await registerUser("RBAC Customer", "customer");
    otherCustomer = await registerUser("RBAC Other Customer", "other-customer");

    const organization = await createOrganization(owner);
    orgId = organization.id;

    await addMember(owner, orgId, admin.email, "ADMIN");
    const addedAgent = await addMember(owner, orgId, agent.email, "AGENT");
    await addMember(owner, orgId, customer.email, "CUSTOMER");
    await addMember(owner, orgId, otherCustomer.email, "CUSTOMER");

    agentMembershipId = addedAgent.id;

    const membersResponse = await request(app)
      .get(`/api/v1/organizations/${orgId}/members`)
      .set(authHeader(owner))
      .expect(200);

    ownerMembershipId = membersResponse.body.data.members.find(
      (member: { role: string }) => member.role === "OWNER"
    ).id;

    const ticket = await createTicket(customer, orgId);
    ticketId = ticket.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("blocks anonymous access to protected organization routes", async () => {
    await request(app).get("/api/v1/organizations").expect(401);
  });

  it("allows owner/admin to list organization members", async () => {
    await request(app)
      .get(`/api/v1/organizations/${orgId}/members`)
      .set(authHeader(owner))
      .expect(200);

    await request(app)
      .get(`/api/v1/organizations/${orgId}/members`)
      .set(authHeader(admin))
      .expect(200);
  });

  it("blocks agent and customer from listing members", async () => {
    await request(app)
      .get(`/api/v1/organizations/${orgId}/members`)
      .set(authHeader(agent))
      .expect(403);

    await request(app)
      .get(`/api/v1/organizations/${orgId}/members`)
      .set(authHeader(customer))
      .expect(403);
  });

  it("protects owner from role changes and removal", async () => {
    await request(app)
      .patch(`/api/v1/organizations/${orgId}/members/${ownerMembershipId}`)
      .set(authHeader(owner))
      .send({
        role: "AGENT"
      })
      .expect(403);

    await request(app)
      .delete(`/api/v1/organizations/${orgId}/members/${ownerMembershipId}`)
      .set(authHeader(owner))
      .expect(403);
  });

  it("blocks admin from granting admin access", async () => {
    await request(app)
      .patch(`/api/v1/organizations/${orgId}/members/${agentMembershipId}`)
      .set(authHeader(admin))
      .send({
        role: "ADMIN"
      })
      .expect(403);
  });

  it("blocks customers from dashboard analytics", async () => {
    await request(app)
      .get(`/api/v1/organizations/${orgId}/dashboard`)
      .set(authHeader(customer))
      .expect(403);
  });

  it("allows staff to view dashboard analytics", async () => {
    await request(app)
      .get(`/api/v1/organizations/${orgId}/dashboard`)
      .set(authHeader(owner))
      .expect(200);

    await request(app)
      .get(`/api/v1/organizations/${orgId}/dashboard`)
      .set(authHeader(agent))
      .expect(200);
  });

  it("allows customer to view own ticket but blocks other customers", async () => {
    await request(app)
      .get(`/api/v1/tickets/${ticketId}`)
      .set(authHeader(customer))
      .expect(200);

    await request(app)
      .get(`/api/v1/tickets/${ticketId}`)
      .set(authHeader(otherCustomer))
      .expect(403);
  });

  it("allows agent to update ticket status but blocks customer", async () => {
    await request(app)
      .patch(`/api/v1/tickets/${ticketId}/status`)
      .set(authHeader(agent))
      .send({
        status: "IN_PROGRESS"
      })
      .expect(200);

    await request(app)
      .patch(`/api/v1/tickets/${ticketId}/status`)
      .set(authHeader(customer))
      .send({
        status: "RESOLVED"
      })
      .expect(403);
  });

  it("allows agent to assign ticket and blocks customer assignment", async () => {
    await request(app)
      .patch(`/api/v1/tickets/${ticketId}/assign`)
      .set(authHeader(agent))
      .send({
        assigneeId: agent.id
      })
      .expect(200);

    await request(app)
      .patch(`/api/v1/tickets/${ticketId}/assign`)
      .set(authHeader(customer))
      .send({
        assigneeId: customer.id
      })
      .expect(403);
  });

  it("blocks assigning tickets to customers", async () => {
    await request(app)
      .patch(`/api/v1/tickets/${ticketId}/assign`)
      .set(authHeader(owner))
      .send({
        assigneeId: customer.id
      })
      .expect(400);
  });

  it("keeps assignment independent and preserves lifecycle timestamps across retries", async () => {
    const fresh = await createTicket(customer, orgId);
    const assigned = await request(app)
      .patch(`/api/v1/tickets/${fresh.id}/assign`)
      .set(authHeader(agent))
      .send({ assigneeId: agent.id })
      .expect(200);
    expect(assigned.body.data.ticket.status).toBe("OPEN");

    await request(app).patch(`/api/v1/tickets/${fresh.id}/status`)
      .set(authHeader(agent)).send({ status: "CLOSED" }).expect(409);
    const resolved = await request(app).patch(`/api/v1/tickets/${fresh.id}/status`)
      .set(authHeader(agent)).send({ status: "RESOLVED" }).expect(200);
    const repeated = await request(app).patch(`/api/v1/tickets/${fresh.id}/status`)
      .set(authHeader(agent)).send({ status: "RESOLVED" }).expect(200);
    expect(repeated.body.data.ticket.resolvedAt).toBe(resolved.body.data.ticket.resolvedAt);
    expect(await prisma.activityLog.count({ where: { ticketId: fresh.id, type: "STATUS_CHANGED" } })).toBe(1);

    const closed = await request(app).patch(`/api/v1/tickets/${fresh.id}/status`)
      .set(authHeader(agent)).send({ status: "CLOSED" }).expect(200);
    expect(closed.body.data.ticket.resolvedAt).toBe(resolved.body.data.ticket.resolvedAt);
    expect(closed.body.data.ticket.closedAt).not.toBeNull();
    const reopened = await request(app).patch(`/api/v1/tickets/${fresh.id}/status`)
      .set(authHeader(agent)).send({ status: "OPEN" }).expect(200);
    expect(reopened.body.data.ticket.resolvedAt).toBeNull();
    expect(reopened.body.data.ticket.closedAt).toBeNull();
    expect(reopened.body.data.ticket.assigneeId).toBe(agent.id);
  });

  it("does not replace the first staff response time on later replies", async () => {
    const fresh = await createTicket(customer, orgId);
    const first = await request(app).post(`/api/v1/tickets/${fresh.id}/messages`)
      .set(authHeader(agent)).send({ body: "First staff reply" }).expect(201);
    await request(app).post(`/api/v1/tickets/${fresh.id}/messages`)
      .set(authHeader(admin)).send({ body: "Second staff reply" }).expect(201);
    const saved = await prisma.ticket.findUniqueOrThrow({ where: { id: fresh.id } });
    expect(saved.firstResponseAt?.toISOString()).toBe(first.body.data.message.createdAt);
  });

  it("allows public messages for ticket participant and staff", async () => {
    await request(app)
      .post(`/api/v1/tickets/${ticketId}/messages`)
      .set(authHeader(customer))
      .send({
        body: "I still need help with this issue."
      })
      .expect(201);

    await request(app)
      .post(`/api/v1/tickets/${ticketId}/messages`)
      .set(authHeader(agent))
      .send({
        body: "We are checking this now."
      })
      .expect(201);
  });

  it("blocks customers from internal notes and activity timeline", async () => {
    await request(app)
      .get(`/api/v1/tickets/${ticketId}/notes`)
      .set(authHeader(customer))
      .expect(403);

    await request(app)
      .get(`/api/v1/tickets/${ticketId}/activity`)
      .set(authHeader(customer))
      .expect(403);
  });

  it("allows agents to use internal notes and activity timeline", async () => {
    await request(app)
      .post(`/api/v1/tickets/${ticketId}/notes`)
      .set(authHeader(agent))
      .send({
        body: "Internal investigation note."
      })
      .expect(201);

    await request(app)
      .get(`/api/v1/tickets/${ticketId}/activity`)
      .set(authHeader(agent))
      .expect(200);
  });

  it("blocks customers from AI draft generation and allows agents", async () => {
    await request(app)
      .post(`/api/v1/tickets/${ticketId}/ai-draft`)
      .set(authHeader(customer))
      .send({
        tone: "PROFESSIONAL"
      })
      .expect(403);

    await request(app)
      .post(`/api/v1/tickets/${ticketId}/ai-draft`)
      .set(authHeader(agent))
      .send({
        tone: "PROFESSIONAL"
      })
      .expect(200);
  });

  it("blocks agents and customers from KB write actions", async () => {
    await request(app)
      .post(`/api/v1/organizations/${orgId}/kb/documents`)
      .set(authHeader(agent))
      .attach("file", Buffer.from("test"), "rbac-test.txt")
      .expect(403);

    await request(app)
      .delete(`/api/v1/organizations/${orgId}/kb/documents/fake-document-id`)
      .set(authHeader(customer))
      .expect(403);
  });

  it("revokes joined sockets after real membership removal and ownership change", async () => {
    const removedAgent = await registerUser("Socket Agent", "socket-agent");
    const added = await addMember(owner, orgId, removedAgent.email, "AGENT");
    const fresh = await createTicket(customer, orgId);
    const httpServer = http.createServer();
    const realtime = initRealtimeServer(httpServer);
    await new Promise<void>(resolve => httpServer.listen(0, "127.0.0.1", resolve));
    const url = `http://127.0.0.1:${(httpServer.address() as AddressInfo).port}`;
    const sockets = [removedAgent, customer].map(user => connectSocket(url, {
      autoConnect: false, transports: ["websocket"], reconnection: false,
      auth: { token: user.accessToken }
    }));
    const received = jest.fn();
    try {
      for (const socket of sockets) {
        socket.on("ticket:message_created", received);
        await new Promise<void>((resolve, reject) => {
          socket.once("connect", resolve);
          socket.once("connect_error", reject);
          socket.connect();
        });
        expect(await socket.timeout(2000).emitWithAck("ticket:join", { ticketId: fresh.id }))
          .toEqual({ ok: true });
      }
      await request(app).delete(`/api/v1/organizations/${orgId}/members/${added.id}`)
        .set(authHeader(admin)).expect(200);
      // Ownership reassignment is a DB fixture change; there is no public transfer API.
      await prisma.ticket.update({ where: { id: fresh.id }, data: { customerId: otherCustomer.id } });
      const response = await request(app).post(`/api/v1/tickets/${fresh.id}/messages`)
        .set(authHeader(owner)).send({ body: "Persisted after access revocation" }).expect(201);
      const message = response.body.data.message;
      // Await an explicit delivery check as well as the service's detached notification.
      await emitTicketMessageCreated({
        ticketId: fresh.id, message: { ...message, createdAt: new Date(message.createdAt) }
      });
      for (const socket of sockets) {
        await socket.timeout(2000).emitWithAck("ticket:leave", { ticketId: "barrier" });
        expect(realtime.sockets.sockets.get(socket.id!)?.rooms.has(`ticket:${fresh.id}`)).toBe(false);
      }
      expect(received).not.toHaveBeenCalled();
      expect(await prisma.ticketMessage.findUnique({ where: { id: message.id } })).not.toBeNull();
    } finally {
      sockets.forEach(socket => socket.disconnect());
      await new Promise<void>(resolve => realtime.close(() => resolve()));
    }
  });

  it("allows agents to search KB but blocks customers", async () => {
    await request(app)
      .get(`/api/v1/organizations/${orgId}/kb/search`)
      .query({
        q: "password reset"
      })
      .set(authHeader(agent))
      .expect(200);

    await request(app)
      .get(`/api/v1/organizations/${orgId}/kb/search`)
      .query({
        q: "password reset"
      })
      .set(authHeader(customer))
      .expect(403);
  });
});
