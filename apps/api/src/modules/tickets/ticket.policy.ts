import type { TicketStatus } from "@prisma/client";
import { AppError } from "../../common/errors/AppError.js";

const transitions: Record<TicketStatus, readonly TicketStatus[]> = {
  OPEN: ["IN_PROGRESS", "WAITING", "RESOLVED"],
  IN_PROGRESS: ["OPEN", "WAITING", "RESOLVED"],
  WAITING: ["OPEN", "IN_PROGRESS", "RESOLVED"],
  RESOLVED: ["OPEN", "CLOSED"],
  CLOSED: ["OPEN"]
};

export function allowedTicketTransitions(status: TicketStatus) {
  return [...transitions[status]];
}

export function ticketStatusChange(
  current: { status: TicketStatus; resolvedAt: Date | null; closedAt: Date | null },
  next: TicketStatus,
  now = new Date()
) {
  if (current.status === next) return null;
  if (!transitions[current.status].includes(next)) {
    throw new AppError(`Cannot change ticket status from ${current.status} to ${next}`, 409);
  }
  return {
    status: next,
    resolvedAt: next === "RESOLVED" ? now : next === "CLOSED" ? current.resolvedAt : null,
    closedAt: next === "CLOSED" ? now : null
  };
}
