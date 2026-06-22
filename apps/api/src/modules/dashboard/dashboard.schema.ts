import { z } from "zod";

export const orgIdParamSchema = z.object({
  params: z.object({
    orgId: z.string().min(1)
  })
});