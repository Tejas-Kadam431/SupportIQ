import { z } from "zod";

export const ticketIdParamSchema = z.object({
  params: z.object({
    ticketId: z.string().min(1)
  })
});