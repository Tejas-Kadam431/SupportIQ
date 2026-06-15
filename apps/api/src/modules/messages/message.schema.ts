import { z } from "zod";

export const ticketIdParamSchema = z.object({
  params: z.object({
    ticketId: z.string().min(1)
  })
});

export const createMessageSchema = z.object({
  params: z.object({
    ticketId: z.string().min(1)
  }),
  body: z.object({
    body: z.string().min(1, "Message cannot be empty").max(5000)
  })
});

export type CreateMessageInput = z.infer<typeof createMessageSchema>["body"];