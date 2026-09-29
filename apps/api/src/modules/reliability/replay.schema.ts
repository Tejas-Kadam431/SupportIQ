import { z } from "zod";
import { PROMPT_VERSION, EVIDENCE_POLICY_VERSION } from "../ai/ai.provenance.js";
export const MAX_CASES = 50, MAX_GUARDRAILS = 10;
export const registry = { id: "support-replay-v1", promptVersion: PROMPT_VERSION, evidencePolicyVersion: EVIDENCE_POLICY_VERSION,
    retrievalOnly: "lexical-rrf-v1", hybrid: "hybrid-rrf-published-v2", generation: "configured-provider-chain-v1", maxCases: MAX_CASES, concurrency: 1 } as const;
const id = z.string().min(1).max(128);
export const suiteCommand = z.object({ name: z.string().trim().min(1).max(160), issueId: id.optional(), runIds: z.array(id).max(MAX_CASES).optional(),
    disposition: z.enum(["ACCEPTED", "EDITED", "REJECTED"]).optional(), abstained: z.boolean().optional(), evidenceDecision: z.enum(["ANSWER_SUPPORTED", "INSUFFICIENT_KNOWLEDGE", "CONFLICTING_KNOWLEDGE", "NEEDS_CUSTOMER_INFO", "RETRIEVAL_DEGRADED"]).optional(),
    from: z.string().datetime().optional(), to: z.string().datetime().optional() }).strict().refine(v => !v.issueId || !v.runIds, "Choose one case source");
export const experimentCommand = z.object({ name: z.string().trim().min(1).max(160), suiteId: id, purpose: z.enum(["PRE_PUBLICATION", "POST_PUBLICATION_VERIFICATION", "GENERAL_COMPARISON"]),
    configurationId: z.literal(registry.id).default(registry.id), generation: z.boolean().default(false), hybrid: z.boolean().default(false), overrideVersionIds: z.array(id).max(10).default([]) }).strict();
export const listQuery = z.object({ page: z.coerce.number().int().min(1).max(10000).default(1), status: z.enum(["DRAFT", "RUNNING", "COMPLETED", "FAILED", "CANCELLED"]).optional(), purpose: z.enum(["PRE_PUBLICATION", "POST_PUBLICATION_VERIFICATION", "GENERAL_COMPARISON"]).optional(), from: z.string().datetime().optional(), to: z.string().datetime().optional(), issueId: id.optional() }).strict();
export const baselineSchema = z.object({ decision: z.string().nullable(), evidenceLevel: z.string().nullable(), sources: z.array(z.object({ documentVersionId: z.string(), documentId: z.string(), evidenceEligible: z.boolean(), lexicalCoverage: z.number().optional() }).passthrough()).max(5), suggestedReply: z.string().max(32000).nullable(), disposition: z.string().nullable(), reason: z.string().nullable(), finalMessage: z.string().max(32000).nullable() }).passthrough();
export type Baseline = z.infer<typeof baselineSchema>;
