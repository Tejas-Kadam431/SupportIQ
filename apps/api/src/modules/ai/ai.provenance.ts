import { contentHash } from "../../common/utils/contentHash.js";
export { contentHash } from "../../common/utils/contentHash.js";
import { z } from "zod";

export const PROMPT_VERSION = "support-copilot-v3";
export const RETRIEVAL_VERSION = "hybrid-rrf-published-v2";
export const EVIDENCE_POLICY_VERSION = "evidence-v2";
export const FALLBACK_VERSION = "support-fallback-v1";
export const OUTPUT_TOKEN_LIMIT = 2048;
export const CONTEXT_MESSAGES = 10;

const text = (limit: number) => z.string().max(limit);
export const evidenceSnapshotSchema = z.array(z.object({
  documentVersionId: text(128), versionNumber: z.number().int().positive(), publishedAt: z.string().nullable(),
  evidenceEligible: z.boolean(), chunkId: text(128), documentId: text(128), documentName: text(512), chunkIndex: z.number().int().nonnegative(),
  score: z.number().finite(), citationLabel: text(16), searchType: z.enum(["semantic", "keyword", "hybrid"]),
  excerpt: text(423), content: text(12000), rank: z.number().int().min(1).max(5), contentHash: z.string().length(64),
  semanticRank: z.number().nullable(), lexicalRank: z.number().nullable(), semanticScore: z.number().nullable(),
  semanticDistance: z.number().nullable(), lexicalScore: z.number().nullable(), lexicalCoverage: z.number(),
  fusedScore: z.number(), matchedBy: z.array(z.enum(["semantic", "lexical"]))
}).strict()).max(5);
export const inputSnapshotSchema = z.object({
  ticket: z.object({ title: text(1000), description: text(12000), status: text(32), priority: text(32), customerName: text(200) }).strict(),
  conversation: z.array(z.object({
    isCustomer: z.boolean(), messageId: text(128), senderName: text(200), content: text(5000), createdAt: z.string().datetime()
  }).strict()).max(CONTEXT_MESSAGES),
  tone: z.enum(["PROFESSIONAL", "FRIENDLY", "CONCISE"]),
  retrievalQuery: text(700)
}).strict();

// Deterministic selection: reverse the latest ten into chronological prompt order.
export const contextSelection = {
  customer: { select: { name: true } },
  messages: {
    select: { id: true, senderId: true, body: true, createdAt: true, sender: { select: { name: true } } },
    orderBy: [{ createdAt: "desc" as const }, { id: "desc" as const }], take: CONTEXT_MESSAGES
  }
};

type ContextTicket = {
  customerId?: string; title: string; description: string; status: string; priority: string;
  customer: { name: string };
  messages: Array<{ id: string; senderId?: string; body: string; createdAt: Date; sender: { name: string } }>;
};

export function captureContext(ticket: ContextTicket) {
  return {
    ticket: { title: ticket.title.slice(0, 1000), description: ticket.description.slice(0, 12000),
      status: ticket.status, priority: ticket.priority, customerName: ticket.customer.name.slice(0, 200) },
    conversation: [...ticket.messages].reverse().map(message => ({
      isCustomer: !!ticket.customerId && message.senderId === ticket.customerId, messageId: message.id, senderName: message.sender.name.slice(0, 200),
      content: message.body.slice(0, 5000), createdAt: message.createdAt.toISOString()
    }))
  };
}


export function contextFingerprint(context: ReturnType<typeof captureContext>, policyVersion = EVIDENCE_POLICY_VERSION) {
  const snapshot = policyVersion === "legacy-v1" ? { ...context, conversation: context.conversation.map(({isCustomer, ...message}) => message) } : context;
  return contentHash(JSON.stringify(snapshot));
}

export function classifyReply(original: string, finalText: string) {
  // Strip outer JS whitespace only; preserve internal spaces and line endings.
  const body = finalText.trim();
  return { body, disposition: body === original.trim() ? "ACCEPTED" as const : "EDITED" as const,
    originalCharCount: original.trim().length, finalCharCount: body.length };
}
