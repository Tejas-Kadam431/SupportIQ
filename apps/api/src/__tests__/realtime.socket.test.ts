import http from "node:http";
import type { AddressInfo } from "node:net";
import jwt from "jsonwebtoken";
import { io as connectClient, type Socket } from "socket.io-client";
import { prisma } from "../config/prisma.js";
import { initRealtimeServer, emitTicketMessageCreated } from "../modules/realtime/realtime.service.js";

jest.mock("../config/prisma.js", () => ({ prisma: { ticket: { findUnique: jest.fn() } } }));
jest.mock("../config/env.js", () => ({ env: {
  JWT_ACCESS_SECRET: "socket-test-secret", JWT_ACCESS_EXPIRES_IN: "15m"
} }));

let server: ReturnType<typeof initRealtimeServer>;
let url: string;
let clients: Socket[];
let roles: Map<string, string>;
let customerId: string;
let log: jest.SpyInstance;
const find = prisma.ticket.findUnique as jest.Mock;
const originalOrigins = process.env.CLIENT_URL;
const payload = {
  ticketId: "ticket-a",
  message: {
    id: "message-a", ticketId: "ticket-a", senderId: "agent", body: "Public reply",
    createdAt: new Date("2026-01-01T00:00:00Z"),
    sender: { id: "agent", name: "Agent", email: "agent@example.test", avatarUrl: null }
  }
};

function token(user = "agent", exp = Math.floor(Date.now() / 1000) + 60) {
  return jwt.sign({ sub: user, exp }, "socket-test-secret");
}

function currentTicket(args: { where: { id: string }; select: {
  organization: { select: { members: { where: { userId: string } } } }
} }) {
  if (args.where.id !== "ticket-a") return null;
  const role = roles.get(args.select.organization.select.members.where.userId);
  return { customerId, organization: { members: role ? [{ role }] : [] } };
}

beforeEach(async () => {
  jest.resetAllMocks();
  log = jest.spyOn(console, "error").mockImplementation(() => {});
  roles = new Map([["agent", "AGENT"], ["customer", "CUSTOMER"], ["admin", "ADMIN"]]);
  customerId = "customer";
  clients = [];
  process.env.CLIENT_URL = " https://one.example, https://two.example ";
  find.mockImplementation(async args => currentTicket(args));
  const httpServer = http.createServer();
  server = initRealtimeServer(httpServer);
  await new Promise<void>(resolve => httpServer.listen(0, "127.0.0.1", resolve));
  url = `http://127.0.0.1:${(httpServer.address() as AddressInfo).port}`;
});

afterEach(async () => {
  clients.forEach(client => client.disconnect());
  await new Promise<void>(resolve => server.close(() => resolve()));
  log.mockRestore();
  if (originalOrigins === undefined) delete process.env.CLIENT_URL;
  else process.env.CLIENT_URL = originalOrigins;
});

function connect(authToken: unknown = token(), origin?: string, transport = "websocket"): Promise<Socket> {
  const client = connectClient(url, {
    auth: authToken === null ? {} : { token: authToken },
    transports: [transport], reconnection: false, timeout: 1500,
    extraHeaders: origin ? { Origin: origin } : undefined
  });
  clients.push(client);
  return new Promise((resolve, reject) => {
    client.once("connect", () => resolve(client));
    client.once("connect_error", reject);
  });
}

function join(client: Socket, ticketId: unknown = "ticket-a") {
  return client.timeout(1500).emitWithAck("ticket:join", { ticketId });
}

// The acknowledgement follows previously queued server events on this socket.
async function barrier(client: Socket) {
  await client.timeout(1500).emitWithAck("ticket:leave", { ticketId: "barrier" });
}

function disconnected(client: Socket) {
  if (!client.connected) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Expected disconnect")), 3500);
    client.once("disconnect", () => { clearTimeout(timeout); resolve(); });
  });
}

test.each([
  ["missing", null],
  ["expired", () => token("agent", Math.floor(Date.now() / 1000) - 1)],
  ["no expiry", () => jwt.sign({ sub: "agent" }, "socket-test-secret")],
  ["no subject", () => jwt.sign({ exp: 9999999999 }, "socket-test-secret")],
  ["wrong signature", () => jwt.sign({ sub: "agent", exp: 9999999999 }, "wrong")],
  ["wrong algorithm", () => jwt.sign({ sub: "agent", exp: 9999999999 }, "socket-test-secret", { algorithm: "HS384" })],
  ["malformed", { token: "bad" }]
])("denies %s connection", async (_label, value) => {
  await expect(connect(typeof value === "function" ? value() : value)).rejects.toThrow();
  expect(find).not.toHaveBeenCalled();
});

test.each(["websocket", "polling"])("checks allowed origins for %s", async transport => {
  const client = await connect(token(), "https://two.example", transport);
  expect(await join(client)).toEqual({ ok: true });
  await expect(connect(token(), "https://evil.example", transport)).rejects.toThrow();
});

test("missing and cross-tenant tickets have the same denied response", async () => {
  const client = await connect(token("tenant-b-user"));
  const crossTenant = await join(client);
  const missing = await join(client, "missing");
  expect(crossTenant).toEqual({ ok: false, error: "Ticket access denied" });
  expect(missing).toEqual(crossTenant);
  expect(server.sockets.adapter.rooms.has("ticket:ticket-a")).toBe(false);
});

test.each([42, {}, "", "ticket:other"])("rejects malformed join id %j", async value => {
  const client = await connect();
  expect(await join(client, value)).toEqual({ ok: false, error: "Invalid ticketId" });
  expect(find).not.toHaveBeenCalled();
});

test("current customer ownership is required at join", async () => {
  roles.set("other-customer", "CUSTOMER");
  const own = await connect(token("customer"));
  const other = await connect(token("other-customer"));
  expect(await join(own)).toEqual({ ok: true });
  expect(await join(other)).toEqual({ ok: false, error: "Ticket access denied" });
});

test("delivers only the explicit public-message projection", async () => {
  const client = await connect();
  expect(await join(client)).toEqual({ ok: true });
  const received = jest.fn();
  client.onAny(received);
  await emitTicketMessageCreated({
    ...payload,
    message: { ...payload.message, internalNotes: ["secret"] } as typeof payload.message
  });
  await barrier(client);
  expect(received.mock.calls).toEqual([["ticket:message_created", {
    ticketId: "ticket-a",
    message: { ...payload.message, createdAt: payload.message.createdAt.toISOString() }
  }]]);
});

test.each(["removed", "demoted", "ownership changed", "ticket deleted"])(
  "stops delivery after access is %s", async change => {
    const user = change === "ownership changed" ? "customer" : "agent";
    const client = await connect(token(user));
    expect(await join(client)).toEqual({ ok: true });
    const received = jest.fn();
    client.on("ticket:message_created", received);
    if (change === "removed") roles.delete(user);
    if (change === "demoted") roles.set(user, "CUSTOMER");
    if (change === "ownership changed") customerId = "new-customer";
    if (change === "ticket deleted") find.mockResolvedValue(null);
    await emitTicketMessageCreated(payload);
    await barrier(client);
    expect(received).not.toHaveBeenCalled();
    expect(server.sockets.sockets.get(client.id!)?.rooms.has("ticket:ticket-a")).toBe(false);
  }
);

test("demotion preserves access when the new customer role owns the ticket", async () => {
  const client = await connect();
  expect(await join(client)).toEqual({ ok: true });
  roles.set("agent", "CUSTOMER");
  customerId = "agent";
  const received = jest.fn();
  client.on("ticket:message_created", received);
  await emitTicketMessageCreated(payload);
  await barrier(client);
  expect(received).toHaveBeenCalledTimes(1);
});

test("DB failure denies join without exposing its error", async () => {
  const client = await connect();
  find.mockRejectedValue(new Error("secret-db-url-and-token"));
  expect(await join(client)).toEqual({ ok: false, error: "Ticket access denied" });
  expect(log.mock.calls).toEqual([[{ event: "realtime.operation_failed", operation: "join" }]]);
});

test("one failed recipient lookup emits nothing to it and does not block others", async () => {
  const agent = await connect();
  const admin = await connect(token("admin"));
  await join(agent);
  await join(admin);
  const denied = jest.fn();
  const allowed = jest.fn();
  agent.on("ticket:message_created", denied);
  admin.on("ticket:message_created", allowed);
  find.mockImplementation(async args => {
    if (args.select.organization.select.members.where.userId === "agent") throw new Error("secret");
    return currentTicket(args);
  });
  const closed = disconnected(agent);
  await emitTicketMessageCreated(payload);
  await closed;
  await barrier(admin);
  expect(denied).not.toHaveBeenCalled();
  expect(allowed).toHaveBeenCalledTimes(1);
  expect(log.mock.calls).toEqual([[{ event: "realtime.operation_failed", operation: "delivery" }]]);
});

test("expiry disconnects an idle subscriber and blocks an in-flight authorization result", async () => {
  const expiry = Math.floor(Date.now() / 1000) + 2;
  const client = await connect(token("agent", expiry));
  await join(client);
  const received = jest.fn();
  client.on("ticket:message_created", received);
  let complete!: (value: unknown) => void;
  find.mockImplementationOnce(() => new Promise(resolve => { complete = resolve; }));
  const closed = disconnected(client);
  const delivery = emitTicketMessageCreated(payload);
  await closed;
  expect(Date.now()).toBeGreaterThanOrEqual(expiry * 1000);
  complete({ customerId, organization: { members: [{ role: "AGENT" }] } });
  await delivery;
  expect(received).not.toHaveBeenCalled();
  expect(server.sockets.adapter.rooms.has("ticket:ticket-a")).toBe(false);
});

test("long lifetimes do not overflow timers and leave prevents delivery", async () => {
  const client = await connect(token("agent", Math.floor(Date.now() / 1000) + 3_000_000));
  await join(client);
  await client.timeout(1500).emitWithAck("ticket:leave", { ticketId: "ticket-a" });
  const received = jest.fn();
  client.on("ticket:message_created", received);
  await emitTicketMessageCreated(payload);
  await barrier(client);
  expect(client.connected).toBe(true);
  expect(received).not.toHaveBeenCalled();
});

test("leaving while a lookup is pending prevents the late result from delivering", async () => {
  const client = await connect();
  await join(client);
  const received = jest.fn();
  client.on("ticket:message_created", received);
  let complete!: (value: unknown) => void;
  find.mockImplementationOnce(() => new Promise(resolve => { complete = resolve; }));
  const delivery = emitTicketMessageCreated(payload);
  await client.timeout(1500).emitWithAck("ticket:leave", { ticketId: "ticket-a" });
  complete({ customerId, organization: { members: [{ role: "AGENT" }] } });
  await delivery;
  await barrier(client);
  expect(received).not.toHaveBeenCalled();
});
