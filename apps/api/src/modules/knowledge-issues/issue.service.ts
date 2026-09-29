import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma.js";
import { AppError } from "../../common/errors/AppError.js";
import { authorizeKnowledge } from "../knowledge-base/kb.version.service.js";
import { lockOrganization } from "../organizations/org.transaction.js";
import { attributedVersions, classifyKnowledgeFailure, grouping, selectedSources, severity, CLASSIFIER_VERSION } from "./issue.classification.js";
import { assertIssueTransition } from "./issue.policy.js";
import { issueCommand } from "./issue.schema.js";
export async function deriveKnowledgeSignal(orgId: string, runId: string) {
    return prisma.$transaction(async (tx) => {
        await lockOrganization(tx, orgId);
        const run = await tx.copilotRun.findFirst({ where: { id: runId, organizationId: orgId }, include: { evaluation: true, knowledgeSources: { include: { version: { select: { documentId: true } } } } } });
        if (!run)
            throw new AppError("Copilot run not found", 404);
        const reason = classifyKnowledgeFailure(run);
        if (!reason)
            return { created: false };
        if (await tx.knowledgeIssueSignal.findUnique({ where: { copilotRunId: runId } }))
            return { created: false };
        // Snapshot claims alone never create version FKs: verify immutable Stage F links.
        const sources = selectedSources(run.sources).filter(s => run.knowledgeSources.some(link => link.documentVersionId === s.documentVersionId && link.version.documentId === s.documentId));
        const group = grouping(run, reason, sources), attributed = attributedVersions(reason, sources);
        let issue = await tx.knowledgeIssue.findUnique({ where: { organizationId_groupingKey: { organizationId: orgId, groupingKey: group.key } } });
        if (!issue) {
            issue = await tx.knowledgeIssue.create({ data: { organizationId: orgId, groupingKey: group.key, normalizedTopic: group.topic, title: group.topic, reason } });
            await tx.knowledgeIssueHistory.create({ data: { issueId: issue.id, event: "DETECTED", metadata: { classifierVersion: CLASSIFIER_VERSION } } });
        }
        await tx.knowledgeIssueSignal.create({ data: { issueId: issue.id, copilotRunId: runId, reason, classifierVersion: CLASSIFIER_VERSION, occurredAt: run.createdAt, sources: { create: sources.map(s => ({ documentVersionId: s.documentVersionId, attributed: attributed.includes(s.documentVersionId) })) } } });
        // Dismissed/published issues retain recurrence, without silently undoing admin decisions.
        return { created: true, issueId: issue.id };
    }, { isolationLevel: "ReadCommitted" });
}
export async function safelyDeriveKnowledgeSignal(orgId: string, runId: string) { try {
    await deriveKnowledgeSignal(orgId, runId);
}
catch {
    console.warn({ event: "knowledge.signal_derivation_failed", organizationId: orgId, runId });
} }
export async function reconcileKnowledgeSignals(orgId: string, afterId?: string, limit = 100) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 500)
        throw new AppError("Batch size must be 1–500", 400);
    const runs = await prisma.copilotRun.findMany({ where: { organizationId: orgId, ...(afterId ? { id: { gt: afterId } } : {}) }, select: { id: true }, orderBy: { id: "asc" }, take: limit });
    let created = 0;
    for (const run of runs)
        if ((await deriveKnowledgeSignal(orgId, run.id)).created)
            created++;
    return { scanned: runs.length, created, nextCursor: runs.length === limit ? runs.at(-1)!.id : null };
}
export async function getIssue(userId: string, orgId: string, issueId: string, page = 1) {
    await authorizeKnowledge(prisma, userId, orgId);
    if (!Number.isInteger(page) || page < 1 || page > 10000)
        throw new AppError("Invalid page", 400);
    const issue = await prisma.knowledgeIssue.findFirst({ where: { id: issueId, organizationId: orgId }, include: { assignee: { include: { user: { select: { id: true, name: true } } } }, candidateVersion: { select: { id: true, documentId: true, versionNumber: true, status: true, publishedAt: true, originalName: true } }, history: { orderBy: { createdAt: "desc" }, take: 50 }, signals: { orderBy: [{ occurredAt: "desc" }, { id: "desc" }], skip: (page - 1) * 25, take: 25, include: { run: { select: { id: true, ticketId: true, createdAt: true, evaluation: { select: { id: true, disposition: true, reason: true } } } }, sources: { include: { version: { select: { id: true, documentId: true, versionNumber: true, originalName: true, status: true } } } } } } } });
    if (!issue)
        throw new AppError("Knowledge issue not found", 404);
    const [counts] = await prisma.$queryRaw<Array<{
        signalCount: number;
        affectedTicketCount: number;
        firstDetectedAt: Date;
        lastDetectedAt: Date;
    }>> `SELECT count(*)::int AS "signalCount",count(DISTINCT r."ticketId")::int AS "affectedTicketCount",coalesce(min(s."occurredAt"),${issue.createdAt}) AS "firstDetectedAt",coalesce(max(s."occurredAt"),${issue.createdAt}) AS "lastDetectedAt" FROM "KnowledgeIssueSignal" s JOIN "CopilotRun" r ON r.id=s."copilotRunId" WHERE s."issueId"=${issueId} AND r."organizationId"=${orgId}`;
    return { ...issue, ...counts, severity: severity(counts.affectedTicketCount), page, hasMore: counts.signalCount > page * 25, recurringAfterPublication: !!(issue.publishedAt && counts.lastDetectedAt > issue.publishedAt) };
}
export async function updateIssue(userId: string, orgId: string, issueId: string, input: unknown) {
    const command = issueCommand.parse(input);
    return prisma.$transaction(async (tx) => {
        await authorizeKnowledge(tx, userId, orgId, true);
        const issue = await tx.knowledgeIssue.findFirst({ where: { id: issueId, organizationId: orgId } });
        if (!issue)
            throw new AppError("Knowledge issue not found", 404);
        if (issue.revision !== command.expectedRevision)
            throw new AppError("Issue changed. Refresh before updating.", 409);
        const data: Prisma.KnowledgeIssueUncheckedUpdateInput = { revision: { increment: 1 } };
        if (command.assignedToUserId !== undefined) {
            const member = command.assignedToUserId === null ? null : await tx.organizationMember.findUnique({ where: { organizationId_userId: { organizationId: orgId, userId: command.assignedToUserId } } });
            if (command.assignedToUserId !== null && (!member || member.role === "CUSTOMER"))
                throw new AppError("Assignee must be current organization staff", 400);
            data.assigneeMemberId = member?.id ?? null;
        }
        if (command.status) {
            assertIssueTransition(issue.status, command.status);
            data.status = command.status;
            if (command.status === "FIX_PROPOSED") {
                if (!command.candidateVersionId || !command.note)
                    throw new AppError("A READY candidate version and fix note are required", 400);
                const version = await tx.knowledgeDocumentVersion.findFirst({ where: { id: command.candidateVersionId, status: "READY", document: { organizationId: orgId, archivedAt: null } } });
                if (!version)
                    throw new AppError("Candidate must be an unpublished READY version in this organization", 400);
                data.candidateVersionId = version.id;
                data.fixNote = command.note;
                data.publishedAt = null;
            }
            else if (command.candidateVersionId)
                throw new AppError("Link a candidate during FIX_PROPOSED", 400);
            if (command.status === "PUBLISHED") {
                const version = issue.candidateVersionId ? await tx.knowledgeDocumentVersion.findFirst({ where: { id: issue.candidateVersionId, status: "PUBLISHED", document: { organizationId: orgId, archivedAt: null, currentPublishedVersionId: issue.candidateVersionId } } }) : null;
                if (!version?.publishedAt)
                    throw new AppError("Publish the linked candidate through the knowledge workflow first", 409);
                data.publishedAt = version.publishedAt;
            }
            if (command.status === "DISMISSED") {
                if (!command.dismissalReason || !command.note)
                    throw new AppError("Dismissal requires a reason and note", 400);
                data.dismissalReason = command.dismissalReason;
                data.dismissedAt = new Date();
                data.dismissedByIdentity = userId;
            }
        }
        else if (command.candidateVersionId)
            throw new AppError("Link a candidate during FIX_PROPOSED", 400);
        if (!command.status && command.assignedToUserId === undefined)
            throw new AppError("No issue change supplied", 400);
        const updated = await tx.knowledgeIssue.update({ where: { id: issueId }, data });
        await tx.knowledgeIssueHistory.create({ data: { issueId, actorIdentity: userId, event: command.status === "DISMISSED" ? "DISMISSED" : command.status === "FIX_PROPOSED" ? "FIX_LINKED" : command.status === "PUBLISHED" ? "CANDIDATE_PUBLICATION_RECORDED" : command.status ? "STATUS_CHANGED" : "ASSIGNED", metadata: { from: issue.status, to: updated.status, assignedToUserId: command.assignedToUserId ?? null, candidateVersionId: updated.candidateVersionId, note: command.note ?? null, dismissalReason: command.dismissalReason ?? null } } });
        return updated;
    }, { isolationLevel: "ReadCommitted" });
}
export async function clearIssueAssignments(tx: Prisma.TransactionClient, orgId: string, userId: string, actorId: string) {
    const issues = await tx.knowledgeIssue.findMany({ where: { organizationId: orgId, assignee: { userId } }, select: { id: true } });
    for (const issue of issues) {
        await tx.knowledgeIssue.update({ where: { id: issue.id }, data: { assigneeMemberId: null, revision: { increment: 1 } } });
        await tx.knowledgeIssueHistory.create({ data: { issueId: issue.id, actorIdentity: actorId, event: "ASSIGNMENT_REVOKED", metadata: { userId } } });
    }
}
