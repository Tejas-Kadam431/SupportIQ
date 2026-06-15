import { prisma } from "../../config/prisma.js";
import { AppError } from "../../common/errors/AppError.js";
import { getTicketOrThrow } from "../tickets/ticket.service.js";
import type { CreateNoteInput } from "./note.schema.js";

type Role = "OWNER" | "ADMIN" | "AGENT" | "CUSTOMER";

function assertStaffRole(role: Role) {
  if (role === "CUSTOMER") {
    throw new AppError("Customers cannot access internal notes", 403);
  }
}

export async function listInternalNotes(userId: string, ticketId: string) {
  const { membership } = await getTicketOrThrow(userId, ticketId);
  const role = membership.role as Role;

  assertStaffRole(role);

  return prisma.internalNote.findMany({
    where: {
      ticketId
    },
    include: {
      author: {
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

export async function createInternalNote(
  userId: string,
  ticketId: string,
  input: CreateNoteInput
) {
  const { ticket, membership } = await getTicketOrThrow(userId, ticketId);
  const role = membership.role as Role;

  assertStaffRole(role);

  const note = await prisma.$transaction(async (tx) => {
    const createdNote = await tx.internalNote.create({
      data: {
        ticketId,
        authorId: userId,
        body: input.body
      },
      include: {
        author: {
          select: {
            id: true,
            name: true,
            email: true,
            avatarUrl: true
          }
        }
      }
    });

    await tx.activityLog.create({
      data: {
        organizationId: ticket.organizationId,
        ticketId,
        actorId: userId,
        type: "INTERNAL_NOTE_ADDED",
        message: `Internal note added on ticket: ${ticket.title}`,
        metadata: {
          noteId: createdNote.id,
          authorRole: role
        }
      }
    });

    return createdNote;
  });

  return note;
}