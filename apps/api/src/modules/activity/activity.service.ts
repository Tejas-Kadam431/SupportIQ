import { prisma } from "../../config/prisma.js";
import { AppError } from "../../common/errors/AppError.js";
import { getTicketOrThrow } from "../tickets/ticket.service.js";

type Role = "OWNER" | "ADMIN" | "AGENT" | "CUSTOMER";

function assertStaffRole(role: Role) {
  if (role === "CUSTOMER") {
    throw new AppError("Customers cannot view internal activity logs", 403);
  }
}

export async function listTicketActivity(userId: string, ticketId: string) {
  const { ticket, membership } = await getTicketOrThrow(userId, ticketId);
  const role = membership.role as Role;

  assertStaffRole(role);

  return prisma.activityLog.findMany({
    where: {
      ticketId: ticket.id
    },
    include: {
      actor: {
        select: {
          id: true,
          name: true,
          email: true,
          avatarUrl: true
        }
      }
    },
    orderBy: {
      createdAt: "desc"
    }
  });
}