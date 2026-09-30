import type { TicketStatus } from "@prisma/client";

export function isAssignableRole(role: string) {
  return role === "OWNER" || role === "ADMIN" || role === "AGENT";
}

export function canAssignTicket(role: string) {
  return role === "OWNER" || role === "ADMIN";
}

export const activeTicketStatuses: TicketStatus[] = ["OPEN", "IN_PROGRESS", "WAITING"];
