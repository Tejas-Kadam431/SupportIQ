import { prisma } from "../../config/prisma.js";

export function isTicketId(value: unknown): value is string {
  return typeof value === "string" && /^[a-zA-Z0-9_-]{1,128}$/.test(value);
}

// No authorization cache: this projection reads current ownership/membership.
// Errors propagate to the boundary, which must withhold delivery and log safely.
export async function canUserAccessTicket(userId: string, ticketId: string) {
  if (!userId || !isTicketId(ticketId)) return false;
  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    select: {
      customerId: true,
      organization: {
        select: {
          members: { where: { userId }, select: { role: true } }
        }
      }
    }
  });
  const role = ticket?.organization.members[0]?.role;
  if (!ticket || !role) return false;
  if (role === "CUSTOMER") return ticket.customerId === userId;
  return role === "OWNER" || role === "ADMIN" || role === "AGENT";
}
