import { z } from "zod";

export const ticketIdParamSchema = z.object({
  params: z.object({
    ticketId: z.string().min(1)
  })
});

export const createNoteSchema = z.object({
  params: z.object({
    ticketId: z.string().min(1)
  }),
  body: z.object({
    body: z.string().min(1, "Note cannot be empty").max(5000)
  })
});

export type CreateNoteInput = z.infer<typeof createNoteSchema>["body"];