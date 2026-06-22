import { z } from "zod";

export const generateAiDraftSchema = z.object({
  params: z.object({
    ticketId: z.string().min(1)
  }),
  body: z.object({
    tone: z
      .enum(["PROFESSIONAL", "FRIENDLY", "CONCISE"])
      .default("PROFESSIONAL")
  })
});

export type GenerateAiDraftInput = z.infer<typeof generateAiDraftSchema>["body"];