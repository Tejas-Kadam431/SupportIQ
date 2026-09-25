import { prisma } from "../../config/prisma.js";
import { getTicketOrThrow } from "../tickets/ticket.service.js";
import type { CreateMessageInput } from "./message.schema.js";
import { emitTicketMessageCreated } from "../realtime/realtime.service.js";
import { logRealtimeFailure } from "../realtime/realtime.logging.js";

type Role = "OWNER" | "ADMIN" | "AGENT" | "CUSTOMER";

function isStaffRole(role: Role) {
  return role !== "CUSTOMER";
}

export async function listTicketMessages(userId: string, ticketId: string) {
  await getTicketOrThrow(userId, ticketId);

  return prisma.ticketMessage.findMany({
    where: {
      ticketId
    },
    include: {
      sender: {
        select: {
          id: true,
          name: true,
          email: true,
          avatarUrl: true
        }
      }
    },
    orderBy: {
      createdAt: "asc"
    }
  });
}

export async function createTicketMessage(
  userId: string,
  ticketId: string,
  input: CreateMessageInput
) {
  const { ticket, membership } = await getTicketOrThrow(userId, ticketId);
  const role = membership.role as Role;

  const message = await prisma.$transaction(async (tx) => {
    const createdMessage = await tx.ticketMessage.create({
      data: {
        ticketId,
        senderId: userId,
        body: input.body
      },
      include: {
        sender: {
          select: {
            id: true,
            name: true,
            email: true,
            avatarUrl: true
          }
        }
      }
    });

    const shouldSetFirstResponse =
      isStaffRole(role) && ticket.firstResponseAt === null;

    if (shouldSetFirstResponse) {
      await tx.ticket.updateMany({
        where: {
          id: ticketId,
          organizationId: ticket.organizationId,
          firstResponseAt: null
        },
        data: {
          firstResponseAt: createdMessage.createdAt
        }
      });
    }

    await tx.activityLog.create({
      data: {
        organizationId: ticket.organizationId,
        ticketId,
        actorId: userId,
        type: "MESSAGE_SENT",
        message: `Message sent on ticket: ${ticket.title}`,
        metadata: {
          messageId: createdMessage.id,
          senderRole: role
        }
      }
    });

    return createdMessage;
  });

  // The transaction has committed. Realtime is best-effort and must not make
  // a saved message appear to have failed (or wait for a slow authorization DB).
  void Promise.resolve()
    .then(() => emitTicketMessageCreated({ ticketId, message }))
    .catch(() => logRealtimeFailure("notification"));

  return message;
}
