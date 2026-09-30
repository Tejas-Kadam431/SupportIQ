import { safelyDeriveKnowledgeSignal } from "../knowledge-issues/issue.service.js";
import { prisma } from "../../config/prisma.js";
import { copilotStorageFailure } from "./ai.logging.js";
import { AppError } from "../../common/errors/AppError.js";
import { isDemoReadonlyUserId } from "../../common/middleware/demoReadOnly.middleware.js";
import { getTicketOrThrow } from "../tickets/ticket.service.js";
import { currentMembership, lockOrganization } from "../organizations/org.transaction.js";
import { isAssignableRole } from "../tickets/assignment.policy.js";
import { notifyTicketMessage, persistTicketMessage } from "../messages/message.service.js";
import { captureContext, classifyReply, contextFingerprint, contextSelection } from "./ai.provenance.js";
import { rejectCopilotBody, sendCopilotBody, type EvaluateCopilotInput, type SendCopilotInput } from "./ai.schema.js";

async function authorize(userId: string, ticketId: string, write = false) {
  const { ticket, membership } = await getTicketOrThrow(userId, ticketId);
  if (!isAssignableRole(membership.role)) throw new AppError("Staff access required", 403);
  if (write && await isDemoReadonlyUserId(userId)) throw new AppError("Demo account cannot submit Copilot decisions", 403);
  return ticket;
}

export async function getCopilotRun(userId: string, ticketId: string, runId: string) {
  const ticket = await authorize(userId, ticketId);
  const run = await prisma.copilotRun.findFirst({
    where: { id: runId, ticketId, organizationId: ticket.organizationId },
    include: { evaluation: { include: { message: true } } }
  });
  if (!run) throw new AppError("Copilot run not found", 404);
  return run;
}

async function decide(userId: string, ticketId: string, runId: string,
  command: { kind: "send"; finalMessage: string } | { kind: "reject"; reason: EvaluateCopilotInput["reason"] }) {
  const authorizedTicket = await authorize(userId, ticketId, true);
  return prisma.$transaction(async tx => {
    await lockOrganization(tx, authorizedTicket.organizationId);
    const member = await currentMembership(tx, userId, authorizedTicket.organizationId);
    if (!isAssignableRole(member.role)) throw new AppError("Staff access required", 403);
    // Ticket lock also conflicts with public-message FK checks: context cannot
    // change between stale-run validation and the atomic message/decision write.
    await tx.$queryRaw`SELECT "id" FROM "Ticket" WHERE "id" = ${ticketId} FOR UPDATE`;
    await tx.$queryRaw`SELECT "id" FROM "CopilotRun" WHERE "id" = ${runId} AND "ticketId" = ${ticketId} AND "organizationId" = ${authorizedTicket.organizationId} FOR UPDATE`;
    const run = await tx.copilotRun.findFirst({ where: {
      id: runId, ticketId, organizationId: authorizedTicket.organizationId
    }, include: { evaluation: { include: { message: { include: {
      sender: { select: { id: true, name: true, email: true, avatarUrl: true } }
    } } } } } });
    if (!run) throw new AppError("Copilot run not found", 404);
    const existing = run.evaluation;
    if (existing) {
      const sameActor = existing.evaluatorIdentity === userId;
      const exactRetry = command.kind === "send"
        ? existing.message !== null && existing.finalMessage === command.finalMessage
        : existing.disposition === "REJECTED" && existing.reason === command.reason;
      if (sameActor && exactRetry) return { evaluation: existing, message: existing.message, replayed: true };
      throw new AppError("This Copilot run already has a terminal decision", 409);
    }
    if (command.kind === "reject") {
      const evaluation = await tx.copilotEvaluation.create({ data: {
        integrityVersion: 1, copilotRunId: run.id, evaluatorId: userId, evaluatorIdentity: userId,
        disposition: "REJECTED", reason: command.reason, originalReply: run.suggestedReply
      } });
      return { evaluation, message: null, replayed: false };
    }
    if (run.abstained || !run.suggestedReply || run.provenanceVersion !== 1) {
      throw new AppError("This run cannot send a reply. Generate a new Copilot run.", 409);
    }
    const ticket = await tx.ticket.findUniqueOrThrow({ where: { id: ticketId }, include: contextSelection });
    if (ticket.organizationId !== run.organizationId || contextFingerprint(captureContext(ticket), run.evidencePolicyVersion ?? "legacy-v1") !== run.contextFingerprint) {
      throw new AppError("Ticket context changed. Generate a new Copilot run.", 409);
    }
    const classified = classifyReply(run.suggestedReply, command.finalMessage);
    const message = await persistTicketMessage(tx, ticket, userId, member.role, { body: classified.body });
    const evaluation = await tx.copilotEvaluation.create({ data: {
      integrityVersion: 1, copilotRunId: run.id, evaluatorId: userId, evaluatorIdentity: userId,
      messageId: message.id, originalReply: run.suggestedReply, finalMessage: message.body,
      disposition: classified.disposition, originalCharCount: classified.originalCharCount,
      finalCharCount: classified.finalCharCount
    } });
    return { evaluation, message, replayed: false };
  }, { isolationLevel: "ReadCommitted" }).catch(copilotStorageFailure);
}

export async function sendCopilotResponse(userId: string, ticketId: string, runId: string, input: SendCopilotInput) {
  const body = sendCopilotBody.parse(input);
  const result = await decide(userId, ticketId, runId, { kind: "send", ...body });
  if (result.message && !result.replayed) notifyTicketMessage(ticketId, result.message);
  await deriveAfterDecision(runId);
  return result;
}

export async function evaluateCopilotRun(userId: string, ticketId: string, runId: string, input: EvaluateCopilotInput) {
  const body = rejectCopilotBody.parse(input);
  const result = await decide(userId, ticketId, runId, { kind: "reject", reason: body.reason });
  await deriveAfterDecision(runId);
  return result.evaluation;
}

async function deriveAfterDecision(runId:string){try {const run=await prisma.copilotRun.findUnique({where:{id:runId},select:{organizationId:true}});if(run)await safelyDeriveKnowledgeSignal(run.organizationId,runId);}catch{console.warn({event:"knowledge.signal_derivation_failed",runId});}}
