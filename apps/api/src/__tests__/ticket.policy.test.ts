import { ticketStatusChange } from "../modules/tickets/ticket.policy.js";
import type { TicketStatus } from "@prisma/client";

const statuses: TicketStatus[] = ["OPEN", "IN_PROGRESS", "WAITING", "RESOLVED", "CLOSED"];
const allowed = new Set([
  "OPEN:IN_PROGRESS", "OPEN:WAITING", "OPEN:RESOLVED",
  "IN_PROGRESS:OPEN", "IN_PROGRESS:WAITING", "IN_PROGRESS:RESOLVED",
  "WAITING:OPEN", "WAITING:IN_PROGRESS", "WAITING:RESOLVED",
  "RESOLVED:OPEN", "RESOLVED:CLOSED", "CLOSED:OPEN"
]);
const resolvedAt = new Date("2026-01-01T00:00:00Z");
const now = new Date("2026-01-02T00:00:00Z");

describe("ticket lifecycle", () => {
  test.each(statuses.flatMap(from => statuses.map(to => [from, to] as const)))(
    "%s -> %s follows the explicit lifecycle",
    (from, to) => {
      const change = () => ticketStatusChange({ status: from, resolvedAt, closedAt: resolvedAt }, to, now);
      if (from === to) {
        expect(change()).toBeNull();
      } else if (!allowed.has(`${from}:${to}`)) {
        expect(change).toThrow(expect.objectContaining({ statusCode: 409 }));
      } else {
        expect(change()).toEqual({
          status: to,
          resolvedAt: to === "RESOLVED" ? now : to === "CLOSED" ? resolvedAt : null,
          closedAt: to === "CLOSED" ? now : null
        });
      }
    }
  );
});
