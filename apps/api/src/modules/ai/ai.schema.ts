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

export const evaluateCopilotSchema = z.object({
  params: z.object({
    ticketId: z.string().min(1),
    runId: z.string().min(1)
  }),

  body: z
    .object({
      disposition: z.enum(["ACCEPTED", "EDITED", "REJECTED"]),
      reason: failureReasonSchema.optional(),
      finalMessage: z.string().trim().max(10000).optional()
    })
    .superRefine((value, ctx) => {
      if (value.disposition === "REJECTED" && !value.reason) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["reason"],
          message: "A rejection reason is required"
        });
      }

      if (
        value.disposition === "EDITED" &&
        !value.finalMessage?.trim()
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["finalMessage"],
          message: "The edited final message is required"
        });
      }
    })
});

export type GenerateAiDraftInput =
  z.infer<typeof generateAiDraftSchema>["body"];

export type EvaluateCopilotInput =
  z.infer<typeof evaluateCopilotSchema>["body"];