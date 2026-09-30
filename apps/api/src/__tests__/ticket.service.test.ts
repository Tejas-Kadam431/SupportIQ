import { createInternalNote } from "../modules/notes/note.service.js";
import { prisma } from "../config/prisma.js";
import { assertOrgMember } from "../modules/organizations/org.service.js";
import { assignTicket, updateTicketStatus, createTicket } from "../modules/tickets/ticket.service.js";
import { createTicketMessage } from "../modules/messages/message.service.js";
import { emitTicketMessageCreated } from "../modules/realtime/realtime.service.js";
import express from "express";
import request from "supertest";

jest.mock("../config/prisma.js", () => ({ prisma: {
  ticket: { findUnique: jest.fn() },
  organizationMember: { findUnique: jest.fn() },
  $transaction: jest.fn()
} }));
jest.mock("../modules/organizations/org.service.js", () => ({ assertOrgMember: jest.fn() }));
jest.mock("../modules/realtime/realtime.service.js", () => ({ emitTicketMessageCreated: jest.fn() }));

const ticket = {
  id: "ticket-a", organizationId: "org-a", customerId: "customer-a",
  assigneeId: null, status: "OPEN", resolvedAt: null, closedAt: null,
  firstResponseAt: null, updatedAt: new Date("2026-01-01"), title: "Help"
};
const tx = {
  $queryRaw: jest.fn(),
  organizationMember: { findUnique: jest.fn() },
  internalNote: { create: jest.fn() },
  ticket: { create: jest.fn(), updateMany: jest.fn(), findUniqueOrThrow: jest.fn(), findFirstOrThrow: jest.fn() },
  ticketMessage: { create: jest.fn() },
  activityLog: { create: jest.fn() }
};

beforeEach(() => {
  jest.resetAllMocks();
  (prisma.ticket.findUnique as jest.Mock).mockResolvedValue(ticket);
  (assertOrgMember as jest.Mock).mockResolvedValue({ role: "ADMIN" });
  tx.organizationMember.findUnique.mockImplementation(async ({ where }) => where.organizationId_userId.userId === "outsider" ? null : { role: "ADMIN" });
  (prisma.organizationMember.findUnique as jest.Mock).mockResolvedValue({ role: "AGENT" });
  (prisma.$transaction as jest.Mock).mockImplementation(async (fn) => fn(tx));
  tx.ticket.updateMany.mockResolvedValue({ count: 1 });
  tx.ticket.findUniqueOrThrow.mockResolvedValue(ticket);
  tx.ticket.findFirstOrThrow.mockResolvedValue(ticket);
});

test.each(["agent-a", null])("assignment to %s never changes status", async (assigneeId) => {
  await assignTicket("agent-a", ticket.id, { assigneeId });
  expect(tx.ticket.updateMany).toHaveBeenCalledWith({
    where: { id: ticket.id, organizationId: "org-a", assigneeId: null, updatedAt: ticket.updatedAt },
    data: { assigneeId }
  });
  expect(tx.activityLog.create).toHaveBeenCalledTimes(1);
});

test.each([null, { role: "CUSTOMER" }])("rejects ineligible assignee %j", async membership => {
  tx.organizationMember.findUnique.mockResolvedValueOnce({ role: "ADMIN" }).mockResolvedValueOnce(membership);
  await expect(assignTicket("agent-a", ticket.id, { assigneeId: "outsider" })).rejects.toMatchObject({ statusCode: 400 });
  expect(tx.ticket.updateMany).not.toHaveBeenCalled();
});

test("customers cannot change lifecycle or assignment", async () => {
  (assertOrgMember as jest.Mock).mockResolvedValue({ role: "CUSTOMER" });
  await expect(updateTicketStatus("customer-a", ticket.id, { status: "RESOLVED" })).rejects.toMatchObject({ statusCode: 403 });
  await expect(assignTicket("customer-a", ticket.id, { assigneeId: null })).rejects.toMatchObject({ statusCode: 403 });
  expect(prisma.$transaction).not.toHaveBeenCalled();
});

test("status write compares the authorized snapshot and records the transition", async () => {
  await updateTicketStatus("agent-a", ticket.id, { status: "RESOLVED" });
  expect(tx.ticket.updateMany).toHaveBeenCalledWith({
    where: { id: ticket.id, organizationId: "org-a", status: "OPEN", updatedAt: ticket.updatedAt },
    data: { status: "RESOLVED", resolvedAt: expect.any(Date), closedAt: null }
  });
  expect(tx.activityLog.create).toHaveBeenCalledWith(expect.objectContaining({
    data: expect.objectContaining({ metadata: { oldStatus: "OPEN", newStatus: "RESOLVED" } })
  }));
});

test("same-state retries do not reset timestamps or append activity", async () => {
  await updateTicketStatus("agent-a", ticket.id, { status: "OPEN" });
  expect(prisma.$transaction).not.toHaveBeenCalled();
});

test.each(["status", "assignment"])("stale %s update fails without writing activity", async kind => {
  tx.ticket.updateMany.mockResolvedValue({ count: 0 });
  const mutation = kind === "status"
    ? updateTicketStatus("agent-a", ticket.id, { status: "RESOLVED" })
    : assignTicket("agent-a", ticket.id, { assigneeId: "agent-a" });
  await expect(mutation).rejects.toMatchObject({ statusCode: 409 });
  expect(tx.activityLog.create).not.toHaveBeenCalled();
});

test("first response uses an atomic null predicate and saved message time", async () => {
  const createdAt = new Date("2026-02-01");
  tx.ticketMessage.create.mockResolvedValue({ id: "message-a", createdAt });
  await createTicketMessage("agent-a", ticket.id, { body: "Reply" });
  expect(tx.ticket.updateMany).toHaveBeenCalledWith({
    where: { id: ticket.id, organizationId: "org-a", firstResponseAt: null },
    data: { firstResponseAt: createdAt }
  });
});

test("customer replies do not start the staff response clock", async () => {
  (assertOrgMember as jest.Mock).mockResolvedValue({ role: "CUSTOMER" });
  tx.organizationMember.findUnique.mockResolvedValue({role:"CUSTOMER"});
  tx.ticketMessage.create.mockResolvedValue({ id: "message-a" });
  await createTicketMessage("customer-a", ticket.id, { body: "More details" });
  expect(tx.ticket.updateMany).not.toHaveBeenCalled();
});

test.each(["throws", "rejects", "stalls"])(
  "HTTP message success survives realtime that %s after commit", async failure => {
    const saved = { id: "saved-message", createdAt: new Date("2026-02-01") };
    tx.ticketMessage.create.mockResolvedValue(saved);
    let committed = false;
    let release: (() => void) | undefined;
    (prisma.$transaction as jest.Mock).mockImplementation(async fn => {
      const result = await fn(tx);
      committed = true;
      return result;
    });
    (emitTicketMessageCreated as jest.Mock).mockImplementation(() => {
      expect(committed).toBe(true);
      if (failure === "throws") throw new Error("secret-token");
      if (failure === "rejects") return Promise.reject(new Error("secret-db-url"));
      return new Promise<void>(resolve => { release = resolve; });
    });
    const log = jest.spyOn(console, "error").mockImplementation(() => {});
    try {
      const app = express();
      app.post("/", async (_req, res, next) => {
        try {
          const message = await createTicketMessage("agent-a", ticket.id, { body: "Reply" });
          res.status(201).json({ message });
        } catch (error) { next(error); }
      });
      const response = await request(app).post("/").expect(201);
      expect(response.body.message.id).toBe(saved.id);
      expect(tx.activityLog.create).toHaveBeenCalledTimes(1);
      if (failure !== "stalls") {
        expect(log.mock.calls).toEqual([[{ event: "realtime.operation_failed", operation: "notification" }]]);
      }
    } finally {
      release?.();
      log.mockRestore();
    }
  }
);

test("failed persistence does not emit a realtime message", async () => {
  (prisma.$transaction as jest.Mock).mockRejectedValue(new Error("transaction failed"));
  await expect(createTicketMessage("agent-a", ticket.id, { body: "Reply" })).rejects.toThrow();
  expect(emitTicketMessageCreated).not.toHaveBeenCalled();
});

test('message write rechecks a membership removed after initial authorization',async()=>{
 tx.organizationMember.findUnique.mockResolvedValue(null);
 await expect(createTicketMessage('agent-a',ticket.id,{body:'Stale access'})).rejects.toMatchObject({statusCode:403});
 expect(tx.ticketMessage.create).not.toHaveBeenCalled();
});
test('message write applies current customer ownership after demotion',async()=>{
 tx.organizationMember.findUnique.mockResolvedValue({role:'CUSTOMER'});
 await expect(createTicketMessage('agent-a',ticket.id,{body:'Demoted'})).rejects.toMatchObject({statusCode:403});
 expect(tx.ticketMessage.create).not.toHaveBeenCalled();
});


test("removed membership prevents ticket creation after initial authorization", async () => {
  tx.organizationMember.findUnique.mockResolvedValue(null);
  await expect(createTicket("agent-a", "org-a", {title:"New ticket",description:"A support question"})).rejects.toMatchObject({statusCode:403});
  expect(tx.ticket.create).not.toHaveBeenCalled();
  expect(tx.activityLog.create).not.toHaveBeenCalled();
});

test.each([null,{role:"CUSTOMER"}])("revoked staff access %j prevents internal note creation", async membership => {
  tx.organizationMember.findUnique.mockResolvedValue(membership);
  await expect(createInternalNote("agent-a", ticket.id, {body:"Private note"})).rejects.toMatchObject({statusCode:403});
  expect(tx.internalNote.create).not.toHaveBeenCalled();
  expect(tx.activityLog.create).not.toHaveBeenCalled();
});
