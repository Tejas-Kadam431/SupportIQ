import { z } from "zod";

export const ticketStatusSchema = z.enum([
  "OPEN",
  "IN_PROGRESS",
  "WAITING",
  "RESOLVED",
  "CLOSED"
]);

export const ticketPrioritySchema = z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]);

export const createTicketSchema = z.object({
  params: z.object({
    orgId: z.string().min(1)
  }),
  body: z.object({
    title: z.string().min(3, "Title must be at least 3 characters"),
    description: z.string().min(5, "Description must be at least 5 characters"),
    priority: ticketPrioritySchema.optional()
  })
});

export const listTicketsSchema = z.object({
  params: z.object({
    orgId: z.string().min(1)
  }),
  query: z.object({
    page: z.string().optional(),
    limit: z.string().optional(),
    status: ticketStatusSchema.optional(),
    priority: ticketPrioritySchema.optional(),
    assigneeId: z.string().optional(),
    customerId: z.string().optional(),
    search: z.string().optional(),
    sort: z.string().optional()
  })
});

export const ticketIdParamSchema = z.object({
  params: z.object({
    ticketId: z.string().min(1)
  })
});

export const updateTicketStatusSchema = z.object({
  params: z.object({
    ticketId: z.string().min(1)
  }),
  body: z.object({
    status: ticketStatusSchema
  })
});

export const assignTicketSchema = z.object({
  params: z.object({
    ticketId: z.string().min(1)
  }),
  body: z.object({
    assigneeId: z.string().min(1).nullable()
  })
});

export type CreateTicketInput = z.infer<typeof createTicketSchema>["body"];
export type ListTicketsQuery = z.infer<typeof listTicketsSchema>["query"];
export type UpdateTicketStatusInput = z.infer<typeof updateTicketStatusSchema>["body"];
export type AssignTicketInput = z.infer<typeof assignTicketSchema>["body"];