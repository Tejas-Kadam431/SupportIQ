import { prisma } from "../../config/prisma.js";
import { AppError } from "../../common/errors/AppError.js";
import { assertOrgMember } from "../organizations/org.service.js";
import type {
  AssignTicketInput,
  CreateTicketInput,
  ListTicketsQuery,
  UpdateTicketStatusInput
} from "./ticket.schema.js";

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

function getStatusDates(status: string) {
  const now = new Date();

  if (status === "RESOLVED") {
    return {
      resolvedAt: now,
      closedAt: null
    };
  }

  if (status === "CLOSED") {
    return {
      closedAt: now
    };
  }

  return {};
}

function assertStaffRole(role: Role) {
  if (role === "CUSTOMER") {
    throw new AppError("Customers cannot perform this action", 403);
  }
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

  return {
    ticket,
    membership
  };
}

export async function getTicketDetails(userId: string, ticketId: string) {
  const { ticket } = await getTicketOrThrow(userId, ticketId);

  return prisma.ticket.findUnique({
    where: {
      id: ticket.id
    },
    include: {
      organization: {
        select: {
          id: true,
          name: true,
          slug: true
        }
      },
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
    }
  });
}

export async function updateTicketStatus(
  userId: string,
  ticketId: string,
  input: UpdateTicketStatusInput
) {
  const { ticket, membership } = await getTicketOrThrow(userId, ticketId);
  const role = membership.role as Role;

  assertStaffRole(role);

  const updatedTicket = await prisma.$transaction(async (tx) => {
    const updated = await tx.ticket.update({
      where: {
        id: ticket.id
      },
      data: {
        status: input.status,
        ...getStatusDates(input.status)
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
        organizationId: ticket.organizationId,
        ticketId: ticket.id,
        actorId: userId,
        type: "STATUS_CHANGED",
        message: `Ticket status changed from ${ticket.status} to ${input.status}`,
        metadata: {
          oldStatus: ticket.status,
          newStatus: input.status
        }
      }
    });

    return updated;
  });

  return updatedTicket;
}

export async function assignTicket(
  userId: string,
  ticketId: string,
  input: AssignTicketInput
) {
  const { ticket, membership } = await getTicketOrThrow(userId, ticketId);
  const role = membership.role as Role;

  assertStaffRole(role);

  if (input.assigneeId) {
    const assigneeMembership = await prisma.organizationMember.findUnique({
      where: {
        organizationId_userId: {
          organizationId: ticket.organizationId,
          userId: input.assigneeId
        }
      }
    });

    if (!assigneeMembership) {
      throw new AppError("Assignee is not a member of this organization", 400);
    }

    if (assigneeMembership.role === "CUSTOMER") {
      throw new AppError("Cannot assign ticket to a customer", 400);
    }
  }

  const updatedTicket = await prisma.$transaction(async (tx) => {
    const updated = await tx.ticket.update({
      where: {
        id: ticket.id
      },
      data: {
        assigneeId: input.assigneeId,
        status: ticket.status === "OPEN" && input.assigneeId ? "IN_PROGRESS" : ticket.status
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
        organizationId: ticket.organizationId,
        ticketId: ticket.id,
        actorId: userId,
        type: "TICKET_ASSIGNED",
        message: input.assigneeId
          ? `Ticket assigned to user ${input.assigneeId}`
          : "Ticket unassigned",
        metadata: {
          oldAssigneeId: ticket.assigneeId,
          newAssigneeId: input.assigneeId
        }
      }
    });

    return updated;
  });

  return updatedTicket;
}