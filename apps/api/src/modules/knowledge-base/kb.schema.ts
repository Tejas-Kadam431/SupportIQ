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

export const searchKnowledgeSchema = z.object({
  params: z.object({
    orgId: z.string().min(1)
  }),
  query: z.object({
    q: z.string().min(1, "Search query is required"),
    limit: z.string().optional()
  })
});

export type SearchKnowledgeQuery = z.infer<typeof searchKnowledgeSchema>["query"];