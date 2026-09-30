import type { Prisma } from "@prisma/client";
import { lockOrganization, currentMembership } from "../organizations/org.transaction.js";
import { isAssignableRole, canAssignTicket, activeTicketStatuses } from "./assignment.policy.js";
import { unassignActiveTickets } from "./assignment.service.js";
import { prisma } from "../../config/prisma.js";
import { AppError } from "../../common/errors/AppError.js";
import { assertOrgMember } from "../organizations/org.service.js";
import { allowedTicketTransitions, ticketStatusChange } from "./ticket.policy.js";
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

function assertStaffRole(role: Role) {
  if (role === "CUSTOMER") {
    throw new AppError("Customers cannot perform this action", 403);
  }
}

export async function createTicket(userId: string, orgId: string, input: CreateTicketInput) {
  await assertOrgMember(userId, orgId);

  const ticket = await prisma.$transaction(async (tx) => {
    await lockOrganization(tx, orgId);
    await currentMembership(tx,userId,orgId);
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

  const where: Prisma.TicketWhereInput = {
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
      orderBy: [parseSort(query.sort), { id: "desc" }],
      skip,
      take: limit
    }),

    prisma.ticket.count({
      where
    })
  ]);

  return {
    tickets: role === "CUSTOMER" ? tickets.map(ticket => ({ ...ticket, _count: { messages: ticket._count.messages } })) : tickets,
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
  const { ticket, membership } = await getTicketOrThrow(userId, ticketId);

  const details = await prisma.ticket.findUnique({
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
  if (!details) throw new AppError("Ticket not found", 404);
  return { ...details, ...(membership.role === "CUSTOMER" ? { _count: { messages: details._count.messages } } : {}), canUseStaffTools: membership.role !== "CUSTOMER", canAssign: canAssignTicket(membership.role), allowedTransitions: membership.role === "CUSTOMER" ? [] : allowedTicketTransitions(details.status) };
}

export async function updateTicketStatus(
  userId: string,
  ticketId: string,
  input: UpdateTicketStatusInput
) {
  const { ticket, membership } = await getTicketOrThrow(userId, ticketId);
  const role = membership.role as Role;

  assertStaffRole(role);

  const change = ticketStatusChange(ticket, input.status);
  if (!change) return getTicketDetails(userId, ticketId);

  const updatedTicket = await prisma.$transaction(async (tx) => {
    await lockOrganization(tx, ticket.organizationId);
    const actor = await currentMembership(tx, userId, ticket.organizationId);
    assertStaffRole(actor.role);

    const result = await tx.ticket.updateMany({
      where: {
        id: ticket.id,
        organizationId: ticket.organizationId,
        status: ticket.status,
        updatedAt: ticket.updatedAt
      },
      data: change
    });
    if (result.count !== 1) {
      throw new AppError("Ticket changed. Refresh and try again.", 409);
    }
    // Historical assignees may no longer be eligible when a ticket is reopened.
    if (ticket.assigneeId && activeTicketStatuses.includes(input.status)) {
      const candidate = await tx.organizationMember.findUnique({ where: {
        organizationId_userId: { organizationId: ticket.organizationId, userId: ticket.assigneeId }
      } });
      if (!candidate || !isAssignableRole(candidate.role)) {
        await unassignActiveTickets(tx, ticket.organizationId, ticket.assigneeId, userId, "REOPENED_INELIGIBLE", ticket.id);
      }
    }
    const updated = await tx.ticket.findUniqueOrThrow({
      where: { id: ticket.id },
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
  }, { isolationLevel: "ReadCommitted" });

  return updatedTicket;
}

export async function assignTicket(
  userId: string,
  ticketId: string,
  input: AssignTicketInput
) {
  const { ticket, membership } = await getTicketOrThrow(userId, ticketId);
  const role = membership.role as Role;

  if (!canAssignTicket(role)) throw new AppError("Only owners and admins can assign tickets", 403);

  const updatedTicket = await prisma.$transaction(async (tx) => {
    await lockOrganization(tx, ticket.organizationId);
    const actor = await currentMembership(tx, userId, ticket.organizationId);
    if (!canAssignTicket(actor.role)) throw new AppError("Only owners and admins can assign tickets", 403);
    if (input.assigneeId) {
      const candidate = await tx.organizationMember.findUnique({ where: {
        organizationId_userId: { organizationId: ticket.organizationId, userId: input.assigneeId }
      } });
      if (!candidate || !isAssignableRole(candidate.role)) throw new AppError("Assignee must be a current staff member", 400);
    }
    const result = await tx.ticket.updateMany({
      where: {
        id: ticket.id,
        organizationId: ticket.organizationId,
        assigneeId: ticket.assigneeId,
        updatedAt: ticket.updatedAt
      },
      data: {
        assigneeId: input.assigneeId
      }
    });
    if (result.count !== 1) {
      throw new AppError("Ticket changed. Refresh and try again.", 409);
    }
    const updated = await tx.ticket.findUniqueOrThrow({
      where: { id: ticket.id },
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
          ? `Ticket assigned to ${updated.assignee?.name ?? "staff member"}`
          : "Ticket unassigned",
        metadata: {
          oldAssigneeId: ticket.assigneeId,
          newAssigneeId: input.assigneeId,
          reason: ticket.assigneeId ? "MANUAL_REASSIGNMENT" : "MANUAL_ASSIGNMENT"
        }
      }
    });

    return updated;
  }, { isolationLevel: "ReadCommitted" });

  return updatedTicket;
}
