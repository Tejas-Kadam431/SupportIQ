import { lockOrganization, currentMembership } from "../organizations/org.transaction.js";
import { AppError } from "../../common/errors/AppError.js";
import { historyPage } from "../../common/pagination.js";
import type { Prisma, Ticket } from "@prisma/client";
import { prisma } from "../../config/prisma.js";
import { getTicketOrThrow } from "../tickets/ticket.service.js";
import type { CreateMessageInput } from "./message.schema.js";
import { emitTicketMessageCreated } from "../realtime/realtime.service.js";
import { logRealtimeFailure } from "../realtime/realtime.logging.js";

type Role = "OWNER" | "ADMIN" | "AGENT" | "CUSTOMER";

function isStaffRole(role: Role) {
  return role !== "CUSTOMER";
}

export async function listTicketMessages(userId: string, ticketId: string, page: unknown = 1) {
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
    ...historyPage(page),
    orderBy: [{ createdAt: "desc" }, { id: "desc" }]
  }).then(rows => rows.reverse());
}

export async function createTicketMessage(
  userId: string,
  ticketId: string,
  input: CreateMessageInput
) {
  const { ticket, membership } = await getTicketOrThrow(userId, ticketId);
  const role = membership.role as Role;

  const message = await prisma.$transaction(tx => persistTicketMessage(tx, ticket, userId, role, input));
  notifyTicketMessage(ticketId, message);
  return message;
}

export async function persistTicketMessage(
  tx: Prisma.TransactionClient,
  ticket: Pick<Ticket, "id" | "organizationId" | "title" | "firstResponseAt">,
  userId: string, role: Role, input: CreateMessageInput
) {
  await lockOrganization(tx, ticket.organizationId);
  const actor = await currentMembership(tx, userId, ticket.organizationId);
  const current = await tx.ticket.findFirstOrThrow({where:{id:ticket.id,organizationId:ticket.organizationId}});
  if (actor.role === "CUSTOMER" && current.customerId !== userId) throw new AppError("Ticket access denied",403);
  role = actor.role;
  const ticketId = ticket.id;
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
}

export function notifyTicketMessage(ticketId: string, message: Awaited<ReturnType<typeof persistTicketMessage>>) {
  // The transaction has committed. Realtime is best-effort and must not make
  // a saved message appear to have failed (or wait for a slow authorization DB).
  void Promise.resolve()
    .then(() => emitTicketMessageCreated({ ticketId, message }))
    .catch(() => logRealtimeFailure("notification"));

}
