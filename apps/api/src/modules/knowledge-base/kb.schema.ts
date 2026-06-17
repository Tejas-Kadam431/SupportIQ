import { z } from "zod";

export const orgIdParamSchema = z.object({
  params: z.object({
    orgId: z.string().min(1)
  })
});

export const documentIdParamSchema = z.object({
  params: z.object({
    documentId: z.string().min(1)
  })
});