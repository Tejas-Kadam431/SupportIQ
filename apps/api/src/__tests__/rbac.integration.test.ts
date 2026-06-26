import request from "supertest";
import { app } from "../app.js";
import { prisma } from "../config/prisma.js";
import { closeKnowledgeProcessingResources } from "../modules/knowledge-base/kb.queue.js";

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
    await closeKnowledgeProcessingResources();
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