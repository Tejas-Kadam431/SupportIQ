import type { Prisma } from "@prisma/client";
import { activeTicketStatuses } from "./assignment.policy.js";

// Caller holds the organization's row lock for the entire transaction.
export async function unassignActiveTickets(
  tx: Prisma.TransactionClient, organizationId: string, assigneeId: string,
  actorId: string, reason: "MEMBER_REMOVED" | "ROLE_BECAME_INELIGIBLE" | "REOPENED_INELIGIBLE", ticketId?: string
) {
  const tickets = await tx.ticket.findMany({
    where: { organizationId, assigneeId, status: { in: activeTicketStatuses }, ...(ticketId ? { id: ticketId } : {}) },
    select: { id: true, assignee: { select: { name: true } } }
  });
  if (!tickets.length) return;
  await tx.ticket.updateMany({ where: { id: { in: tickets.map(ticket => ticket.id) } }, data: { assigneeId: null } });
  await tx.activityLog.createMany({ data: tickets.map(ticket => ({
    organizationId, ticketId: ticket.id, actorId, type: "TICKET_ASSIGNED" as const,
    message: `Automatically unassigned ${ticket.assignee?.name ?? "former member"}: ${reason.toLowerCase().replaceAll("_", " ")}`,
    metadata: { oldAssigneeId: assigneeId, newAssigneeId: null, reason }
  })) });
}
