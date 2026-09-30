import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma.js";
import { AppError } from "../../common/errors/AppError.js";
import { authorizeKnowledge } from "../knowledge-base/kb.version.service.js";
import { inputSnapshotSchema } from "../ai/ai.provenance.js";
import { env } from "../../config/env.js";
import { suiteCommand, experimentCommand, listQuery, MAX_CASES, MAX_GUARDRAILS, registry, baselineSchema } from "./replay.schema.js";
export const json = (value: unknown): Prisma.InputJsonValue => JSON.parse(JSON.stringify(value));
export async function issueCohort(tx: Prisma.TransactionClient, orgId: string, issueId: string) {
    const issue = await tx.knowledgeIssue.findFirst({ where: { id: issueId, organizationId: orgId }, include: { candidateVersion: true } });
    if (!issue)
        throw new AppError('Knowledge issue not found', 404);
    const signals = await tx.knowledgeIssueSignal.findMany({ where: { issueId }, orderBy: { copilotRunId: 'asc' }, take: MAX_CASES + 1, include: { sources: { include: { version: { select: { documentId: true } } } } } });
    if (signals.length > MAX_CASES)
        throw new AppError('Issue exceeds the 50-case limit; verification cannot omit failures', 409);
    const failureIds = signals.map(s => s.copilotRunId), documents = [...new Set(signals.flatMap(s => s.sources.map(x => x.version.documentId)).concat(issue.candidateVersion ? [issue.candidateVersion.documentId] : []))];
    // Stable oldest-first, at most ten, same document or exact normalized topic. No random sampling.
    const guards = await tx.copilotRun.findMany({ where: { organizationId: orgId, id: { notIn: failureIds }, provenanceVersion: 1, evaluation: { disposition: 'ACCEPTED' }, outputSnapshot: { path: ['evidenceDecision'], equals: 'ANSWER_SUPPORTED' }, OR: [{ knowledgeSources: { some: { version: { documentId: { in: documents } } } } }, { topic: { equals: issue.normalizedTopic, mode: 'insensitive' } }] }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], take: MAX_GUARDRAILS, select: { id: true } });
    if (failureIds.length + guards.length > MAX_CASES)
        throw new AppError('Failures and guardrails exceed the 50-case limit', 409);
    return { issue, failureIds, guardrailIds: guards.map(g => g.id) };
}
export async function createSuite(userId: string, orgId: string, input: unknown) {
    const command = suiteCommand.parse(input);
    return prisma.$transaction(async (tx) => {
        await authorizeKnowledge(tx, userId, orgId, true);
        const cohort = command.issueId ? await issueCohort(tx, orgId, command.issueId) : null;
        const ids = cohort ? [...cohort.failureIds, ...cohort.guardrailIds] : command.runIds;
        const from = command.from ? new Date(command.from) : new Date(Date.now() - 30 * 86400000), to = command.to ? new Date(command.to) : new Date();
        if (!ids && (to <= from || to.getTime() - from.getTime() > 90 * 86400000))
            throw new AppError('Choose a valid range of at most 90 days', 400);
        const runs = await tx.copilotRun.findMany({ where: { organizationId: orgId, ...(ids ? { id: { in: ids } } : { createdAt: { gte: from, lt: to }, ...(command.disposition ? { evaluation: { disposition: command.disposition } } : {}), ...(command.abstained === undefined ? {} : { abstained: command.abstained }), ...(command.evidenceDecision ? { outputSnapshot: { path: ['evidenceDecision'], equals: command.evidenceDecision } } : {}) }) }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], take: MAX_CASES + 1, include: { evaluation: true } });
        if (!runs.length || runs.length > MAX_CASES || (ids && runs.length !== new Set(ids).size))
            throw new AppError('Select 1–50 accessible historical runs; narrow the filters instead of silently truncating', 400);
        const cases = runs.map(run => {
            const parsed = inputSnapshotSchema.safeParse(run.inputSnapshot);
            if (!parsed.success || run.provenanceVersion !== 1)
                throw new AppError('A selected run lacks a complete immutable input snapshot', 409);
            const out = run.outputSnapshot as Record<string, unknown> | null;
            const baseline = baselineSchema.parse({ decision: out?.evidenceDecision ?? null, evidenceLevel: out?.evidenceLevel ?? null, sources: run.sources, suggestedReply: run.suggestedReply, disposition: run.evaluation?.disposition ?? null, reason: run.evaluation?.reason ?? null, finalMessage: run.evaluation?.finalMessage ?? null, issueReason: cohort?.issue.reason ?? null, provider: run.provider, model: run.model, promptVersion: run.promptVersion, retrievalVersion: run.retrievalVersion, evidencePolicyVersion: run.evidencePolicyVersion, promptSnapshot: run.promptSnapshot, generationConfig: run.generationConfig, providerMetadata: run.providerMetadata, ticketId: run.ticketId, createdAt: run.createdAt.toISOString() });
            return { historicalCopilotRunId: run.id, kind: cohort?.failureIds.includes(run.id) ? 'FAILURE' : cohort?.guardrailIds.includes(run.id) ? 'GUARDRAIL' : 'HISTORICAL', input: json(parsed.data), baseline: json(baseline) };
        });
        return tx.evaluationSuite.create({ data: { organizationId: orgId, issueId: command.issueId, name: command.name, actorIdentity: userId, sampling: json({ version: 'oldest-related-v1', failureCount: cohort?.failureIds.length ?? 0, guardrailCount: cohort?.guardrailIds.length ?? 0, maxGuardrails: MAX_GUARDRAILS, source: 'HISTORICAL' }), cases: { create: cases } }, include: { _count: { select: { cases: true } } } });
    }, { timeout: 15000 });
}
export async function createExperiment(userId: string, orgId: string, input: unknown) {
    const command = experimentCommand.parse(input);
    return prisma.$transaction(async (tx) => {
        await authorizeKnowledge(tx, userId, orgId, true);
        const suite = await tx.evaluationSuite.findFirst({ where: { id: command.suiteId, organizationId: orgId }, include: { _count: { select: { cases: true } }, issue: true } });
        if (!suite || suite._count.cases < 1 || suite._count.cases > MAX_CASES)
            throw new AppError('Valid suite required', 400);
        if (command.generation && suite._count.cases > 10)
            throw new AppError('Generated replay is limited to 10 cases', 400);
        if (command.purpose !== 'GENERAL_COMPARISON' && !suite.issue)
            throw new AppError('Knowledge verification requires an issue suite', 400);
        const overrides = await tx.knowledgeDocumentVersion.findMany({ where: { id: { in: command.overrideVersionIds }, status: { in: ['READY', 'PUBLISHED', 'SUPERSEDED'] }, document: { organizationId: orgId, archivedAt: null } }, include: { document: true } });
        if (overrides.length !== new Set(command.overrideVersionIds).size || new Set(overrides.map(v => v.documentId)).size !== overrides.length)
            throw new AppError('Invalid candidate versions', 400);
        if (command.purpose !== 'GENERAL_COMPARISON' && !overrides.some(v => v.id === suite.issue?.candidateVersionId))
            throw new AppError('Explicit linked candidate override required', 409);
        if (command.purpose === 'POST_PUBLICATION_VERIFICATION' && (suite.issue?.status !== 'PUBLISHED' || !overrides.some(v => v.id === suite.issue?.candidateVersionId && v.status === 'PUBLISHED' && v.document.currentPublishedVersionId === v.id)))
            throw new AppError('The linked fix must currently be published', 409);
        const current = await tx.knowledgeDocumentVersion.findMany({ where: { status: 'PUBLISHED', document: { organizationId: orgId, archivedAt: null } }, take: 1001 });
        if (current.length > 1000)
            throw new AppError('Replay scope exceeds 1000 documents', 400);
        const versions = [...current.filter(v => !overrides.some(o => o.documentId === v.documentId)), ...overrides];
        if (versions.some(v => !v.contentHash))
            throw new AppError('Candidate scope has incomplete content provenance', 409);
        // Publication uses the same organization lock. Scope rows then pin immutable content in PostgreSQL.
        return tx.evaluationExperiment.create({ data: { organizationId: orgId, suiteId: suite.id, name: command.name, purpose: command.purpose, actorIdentity: userId, summary: { total: suite._count.cases, completed: 0 }, configuration: json({ ...registry, generation: command.generation, hybrid: command.hybrid, providerModels: { gemini: env.GEMINI_MODEL, openai: env.OPENAI_MODEL, embedding: env.OPENAI_EMBEDDING_MODEL }, retrievalVersion: command.hybrid ? registry.hybrid : registry.retrievalOnly, providerCallEstimate: { embeddings: command.hybrid ? suite._count.cases : 0, generationMaximum: command.generation ? suite._count.cases * 2 : 0 }, issueRevision: suite.issue?.revision ?? null }), scope: { create: versions.map(v => ({ documentVersionId: v.id, override: command.overrideVersionIds.includes(v.id), contentHash: v.contentHash! })) } }, include: { scope: true } });
    }, { timeout: 15000 });
}
export async function listExperiments(userId: string, orgId: string, input: unknown) {
    await authorizeKnowledge(prisma, userId, orgId);
    const q = listQuery.parse(input);
    const rows = await prisma.evaluationExperiment.findMany({ where: { organizationId: orgId, status: q.status, purpose: q.purpose, ...(q.issueId ? { suite: { issueId: q.issueId } } : {}), ...(q.from || q.to ? { createdAt: { gte: q.from ? new Date(q.from) : undefined, lt: q.to ? new Date(q.to) : undefined } } : {}) }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: (q.page - 1) * 25, take: 26, include: { suite: { select: { name: true, issueId: true, _count: { select: { cases: true } } } }, scope: { where: { override: true }, include: { version: { select: { versionNumber: true, originalName: true } } } } } });
    return { experiments: rows.slice(0, 25), hasMore: rows.length > 25, page: q.page };
}
export async function getExperiment(userId: string, orgId: string, id: string) {
    await authorizeKnowledge(prisma, userId, orgId);
    const e = await prisma.evaluationExperiment.findFirst({ where: { id, organizationId: orgId }, include: { suite: { include: { cases: { orderBy: { id: 'asc' } } } }, scope: { include: { version: { select: { documentId: true, versionNumber: true, originalName: true, status: true } } } }, results: { orderBy: { caseId: 'asc' } } } });
    if (!e)
        throw new AppError('Experiment not found', 404);
    return e;
}
export async function listSuites(userId: string, orgId: string, page = 1) { await authorizeKnowledge(prisma, userId, orgId); if (!Number.isInteger(page) || page < 1 || page > 10000)
    throw new AppError('Invalid page', 400); const rows = await prisma.evaluationSuite.findMany({ where: { organizationId: orgId }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 26, skip: (page - 1) * 25, include: { _count: { select: { cases: true } } } }); return { suites: rows.slice(0, 25), hasMore: rows.length > 25 }; }
