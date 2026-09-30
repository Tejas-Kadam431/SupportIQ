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

const failureReasonSchema = z.enum([
  "WRONG_KNOWLEDGE",
  "MISSING_CUSTOMER_CONTEXT",
  "INSUFFICIENT_KB",
  "IRRELEVANT_EVIDENCE",
  "INCORRECT_RECOMMENDATION",
  "INCOMPLETE_RESPONSE",
  "BAD_TONE",
  "UNSUPPORTED_CLAIM",
  "OTHER"
]);

const runParams = z.object({ ticketId: z.string().min(1), runId: z.string().min(1) });
export const sendCopilotBody = z.object({ finalMessage: z.string().trim().min(1).max(5000) }).strict();
export const sendCopilotSchema = z.object({ params: runParams, body: sendCopilotBody });
export const copilotRunSchema = z.object({ params: runParams });
export const rejectCopilotBody = z.object({ disposition: z.literal("REJECTED"), reason: failureReasonSchema }).strict();
export const evaluateCopilotSchema = z.object({ params: runParams, body: rejectCopilotBody });
export type GenerateAiDraftInput = z.infer<typeof generateAiDraftSchema>["body"];
export type EvaluateCopilotInput = z.infer<typeof rejectCopilotBody>;
export type SendCopilotInput = z.infer<typeof sendCopilotBody>;
