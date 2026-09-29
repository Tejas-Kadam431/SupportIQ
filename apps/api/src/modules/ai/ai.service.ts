import { evaluateCopilotContext } from "./ai.core.js";
import { safelyDeriveKnowledgeSignal } from "../knowledge-issues/issue.service.js";
import { copilotStorageFailure } from "./ai.logging.js";
import { captureContext, contextSelection, contextFingerprint, PROMPT_VERSION, RETRIEVAL_VERSION, EVIDENCE_POLICY_VERSION, FALLBACK_VERSION, OUTPUT_TOKEN_LIMIT } from "./ai.provenance.js";
import { currentMembership, lockOrganization } from "../organizations/org.transaction.js";
export { evaluateCopilotRun } from "./ai.decision.js";
import { prisma } from "../../config/prisma.js";
import { AppError } from "../../common/errors/AppError.js";
import { getTicketOrThrow } from "../tickets/ticket.service.js";
import { searchKnowledgeBase } from "../knowledge-base/kb.service.js";
import type {
  GenerateAiDraftInput
} from "./ai.schema.js";
import { isDemoReadonlyUserId } from "../../common/middleware/demoReadOnly.middleware.js";

type Role = "OWNER" | "ADMIN" | "AGENT" | "CUSTOMER";
function assertStaffRole(role: Role) {
  if (role === "CUSTOMER") {
    throw new AppError("Customers cannot generate AI drafts", 403);
  }
}

export async function generateAiDraftReply(
  userId: string,
  ticketId: string,
  input: GenerateAiDraftInput
) {
  const startedAt = new Date();
  const { ticket, membership } = await getTicketOrThrow(userId, ticketId);
  const role = membership.role as Role;

  assertStaffRole(role);

  const ticketDetails = await prisma.ticket.findUnique({ where: { id: ticket.id }, include: contextSelection });

  if (!ticketDetails) {
    throw new AppError("Ticket not found", 404);
  }

  const context = captureContext(ticketDetails);
  const { generationTicket, requestedQuery, kbSearch, searchQuery, searchMode, evidence, sources, inputSnapshot, confidence, prompt, generation, provider, draft, warnings, copilot, suggestedReply } = await evaluateCopilotContext(context, input, q => searchKnowledgeBase(ticketDetails.organizationId, {q, limit: "5"}));
  const shouldWriteActivity = !(await isDemoReadonlyUserId(userId));
  let runId: string | null = null;

  const completedAt = new Date();
  if (shouldWriteActivity) {
    const run = await prisma.$transaction(async tx => {
      await lockOrganization(tx, ticketDetails.organizationId);
      const current = await currentMembership(tx, userId, ticketDetails.organizationId);
      assertStaffRole(current.role);
      const saved = await tx.copilotRun.create({ data: {
        organizationId: ticketDetails.organizationId, ticketId: ticketDetails.id, triggeredById: userId, triggeredByIdentity: userId,
        provider, confidence, tone: input.tone, topic: copilot.topic, issueSummary: copilot.issueSummary,
        missingInformation: copilot.missingInformation, recommendedAction: copilot.recommendedAction,
        suggestedReply, abstained: copilot.abstained, searchQuery, searchMode, sourceCount: sources.length,
        sources, warnings,
        knowledgeSources: { create: sources.map(source=>({documentVersionId:source.documentVersionId,chunkId:source.chunkId})) },
        provenanceVersion: 1, status: copilot.abstained ? "ABSTAINED" : "COMPLETED", model: generation.model,
        promptVersion: PROMPT_VERSION, retrievalVersion: RETRIEVAL_VERSION, evidencePolicyVersion: EVIDENCE_POLICY_VERSION,
        generationPath: !evidence.generationAllowed ? "SKIPPED_EVIDENCE" : provider === "fallback" ? "LOCAL_FALLBACK" : "MODEL",
        generationDurationMs: completedAt.getTime() - startedAt.getTime(), startedAt, completedAt,
        contextFingerprint: contextFingerprint(context), inputSnapshot,
        promptSnapshot: { renderedPrompt: prompt, requests: generation.requests },
        outputSnapshot: { rawGeneratedText: generation.rawDraft ?? draft, generatedDraft: draft, suggestedReply, ...copilot, confidence, warnings, evidenceDecision: evidence.decision, evidenceLevel: evidence.evidenceLevel, evidenceReason: evidence.reason },
        generationConfig: { outputTokenLimit: provider === "fallback" ? null : OUTPUT_TOKEN_LIMIT, fallbackVersion: FALLBACK_VERSION,
          temperature: provider === "openai" ? 0.25 : null, boundsVersion: "copilot-bounds-v1" },
        providerMetadata: { attempts: generation.attempts, fallbackReason: generation.fallbackReason,
          providerGenerationSkipped: generation.requests.length === 0, providerCallAttempted: generation.requests.length > 0, retrievalRequestedQuery: requestedQuery,
          retrieval: { ...kbSearch.diagnostics, candidates: kbSearch.candidates.map(({content,document,...candidate})=>({...candidate,documentName:document.originalName.slice(0,512)})) },
          evidence: { decision: evidence.decision, reason: evidence.reason, evidenceLevel: evidence.evidenceLevel, uniqueDocumentCount: evidence.uniqueDocumentCount, selectedChunkCount: evidence.selectedChunkCount } }
      } });
      await tx.activityLog.create({ data: {
        organizationId: ticketDetails.organizationId, ticketId: ticketDetails.id, actorId: userId,
        type: "AI_REPLY_GENERATED", message: `AI reply generated for ticket: ${generationTicket.title}`,
        metadata: { runId: saved.id, provider, sourceCount: sources.length, searchQuery, searchMode,
          confidence, tone: input.tone, promptVersion: PROMPT_VERSION }
      } });
      return saved;
    }, { isolationLevel: "ReadCommitted" }).catch(copilotStorageFailure);
    runId = run.id;
    await safelyDeriveKnowledgeSignal(ticketDetails.organizationId, run.id);
  }

  return {
    runId,
    evidenceDecision: evidence.decision, evidenceLevel: evidence.evidenceLevel, evidenceReason: evidence.reason,

    topic: copilot.topic,
    issueSummary: copilot.issueSummary,
    missingInformation: copilot.missingInformation,
    recommendedAction: copilot.recommendedAction,

    suggestedReply,
    abstained: copilot.abstained,

    // Keep this temporarily for backward compatibility.
    draft: suggestedReply ?? "",

    provider,
    confidence,
    warnings,
    tone: input.tone,

    grounding: {
      searchQuery,
      searchMode,
      sourceCount: sources.length,
      hasKnowledgeContext: sources.length > 0
    },

    sources,

    ticket: {
      id: ticketDetails.id,
      title: ticketDetails.title,
      status: ticketDetails.status,
      priority: ticketDetails.priority
    }
  };
}
