import { prisma } from "../config/prisma.js";
import { canUserAccessTicket, isTicketId } from "../modules/realtime/realtime.authorization.js";

jest.mock("../config/prisma.js", () => ({ prisma: { ticket: { findUnique: jest.fn() } } }));
const find = prisma.ticket.findUnique as jest.Mock;
beforeEach(() => jest.resetAllMocks());

test.each(["OWNER", "ADMIN", "AGENT"])("%s may access another member's ticket", async role => {
  find.mockResolvedValue({ customerId: "customer", organization: { members: [{ role }] } });
  expect(await canUserAccessTicket("staff", "ticket-a")).toBe(true);
  expect(find).toHaveBeenCalledWith({
    where: { id: "ticket-a" },
    select: { customerId: true, organization: {
      select: { members: { where: { userId: "staff" }, select: { role: true } } }
    } }
  });
});

test.each([
  ["customer", "customer", "CUSTOMER", true],
  ["other", "customer", "CUSTOMER", false],
  ["unknown-role", "customer", "UNRECOGNIZED", false]
])("ownership and role: %s", async (userId, customerId, role, expected) => {
  find.mockResolvedValue({ customerId, organization: { members: [{ role }] } });
  expect(await canUserAccessTicket(userId as string, "ticket-a")).toBe(expected);
});

test.each(["non-member", "tenant-b-user"])("%s is denied even for a known ticket", async userId => {
  find.mockResolvedValue({ customerId: "customer", organization: { members: [] } });
  expect(await canUserAccessTicket(userId, "ticket-a")).toBe(false);
});

test("missing ticket is denied", async () => {
  find.mockResolvedValue(null);
  expect(await canUserAccessTicket("agent", "missing")).toBe(false);
});

test("DB failure propagates instead of granting access", async () => {
  find.mockRejectedValue(new Error("database unavailable"));
  await expect(canUserAccessTicket("agent", "ticket-a")).rejects.toThrow("database unavailable");
});

test("membership is reread rather than cached", async () => {
  find.mockResolvedValueOnce({ customerId: "customer", organization: { members: [{ role: "AGENT" }] } })
    .mockResolvedValueOnce({ customerId: "customer", organization: { members: [] } });
  expect(await canUserAccessTicket("agent", "ticket-a")).toBe(true);
  expect(await canUserAccessTicket("agent", "ticket-a")).toBe(false);
});

test.each([undefined, null, {}, 42, "", " ", "ticket:other", "a".repeat(129)])(
  "malformed identifier %j never reaches DB", async value => {
    expect(isTicketId(value)).toBe(false);
    expect(await canUserAccessTicket("agent", value as string)).toBe(false);
    expect(find).not.toHaveBeenCalled();
  }
);
