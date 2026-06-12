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

export type CreateTicketInput = z.infer<typeof createTicketSchema>["body"];

export type ListTicketsQuery = z.infer<typeof listTicketsSchema>["query"];