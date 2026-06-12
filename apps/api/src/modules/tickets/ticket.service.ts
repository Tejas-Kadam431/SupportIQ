import { prisma } from "../../config/prisma.js";
import { AppError } from "../../common/errors/AppError.js";
import { assertOrgMember } from "../organizations/org.service.js";
import type { CreateTicketInput, ListTicketsQuery } from "./ticket.schema.js";

type Role = "OWNER" | "ADMIN" | "AGENT" | "CUSTOMER";

function parsePositiveInt(value: string | undefined, fallback: number) {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
}

function parseSort(sort: string | undefined) {
  if (!sort) {
    return {
      createdAt: "desc" as const
    };
  }

  const [field, direction] = sort.split(":");

  const allowedFields = ["createdAt", "updatedAt", "priority", "status"];

  if (!allowedFields.includes(field)) {
    return {
      createdAt: "desc" as const
    };
  }

  return {
    [field]: direction === "asc" ? "asc" : "desc"
  };
}

export async function createTicket(userId: string, orgId: string, input: CreateTicketInput) {
  await assertOrgMember(userId, orgId);

  const ticket = await prisma.$transaction(async (tx) => {
    const createdTicket = await tx.ticket.create({
      data: {
        organizationId: orgId,
        customerId: userId,
        title: input.title,
        description: input.description,
        priority: input.priority ?? "MEDIUM"
      },
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            email: true,
            avatarUrl: true
          }
        },
        assignee: {
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
        organizationId: orgId,
        ticketId: createdTicket.id,
        actorId: userId,
        type: "TICKET_CREATED",
        message: `Ticket created: ${createdTicket.title}`,
        metadata: {
          ticketId: createdTicket.id,
          priority: createdTicket.priority
        }
      }
    });

    return createdTicket;
  });

  return ticket;
}

export async function listTickets(userId: string, orgId: string, query: ListTicketsQuery) {
  const membership = await assertOrgMember(userId, orgId);
  const role = membership.role as Role;

  const page = parsePositiveInt(query.page, 1);
  const limit = Math.min(parsePositiveInt(query.limit, 10), 50);
  const skip = (page - 1) * limit;

  const where: any = {
    organizationId: orgId
  };

  if (role === "CUSTOMER") {
    where.customerId = userId;
  }

  if (query.status) {
    where.status = query.status;
  }

  if (query.priority) {
    where.priority = query.priority;
  }

  if (query.assigneeId && role !== "CUSTOMER") {
    where.assigneeId = query.assigneeId;
  }

  if (query.customerId && role !== "CUSTOMER") {
    where.customerId = query.customerId;
  }

  if (query.search) {
    where.OR = [
      {
        title: {
          contains: query.search,
          mode: "insensitive"
        }
      },
      {
        description: {
          contains: query.search,
          mode: "insensitive"
        }
      }
    ];
  }

  const [tickets, total] = await Promise.all([
    prisma.ticket.findMany({
      where,
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            email: true,
            avatarUrl: true
          }
        },
        assignee: {
          select: {
            id: true,
            name: true,
            email: true,
            avatarUrl: true
          }
        },
        _count: {
          select: {
            messages: true,
            internalNotes: true
          }
        }
      },
      orderBy: parseSort(query.sort),
      skip,
      take: limit
    }),

    prisma.ticket.count({
      where
    })
  ]);

  return {
    tickets,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit)
    }
  };
}

export async function getTicketOrThrow(userId: string, ticketId: string) {
  const ticket = await prisma.ticket.findUnique({
    where: {
      id: ticketId
    }
  });

  if (!ticket) {
    throw new AppError("Ticket not found", 404);
  }

  const membership = await assertOrgMember(userId, ticket.organizationId);

  if (membership.role === "CUSTOMER" && ticket.customerId !== userId) {
    throw new AppError("Ticket access denied", 403);
  }

  return ticket;
}