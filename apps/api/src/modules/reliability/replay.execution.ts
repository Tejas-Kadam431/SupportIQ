import { prisma } from "../../config/prisma.js";
import { env } from "../../config/env.js";
import { AppError } from "../../common/errors/AppError.js";
import { authorizeKnowledge } from "../knowledge-base/kb.version.service.js";
import { runEvaluationCase } from "./replay.case.js";
import { getExperiment, issueCohort, json } from "./replay.service.js";
import { registry } from "./replay.schema.js";
import { z } from "zod";
const configuration = z.object({ id: z.literal(registry.id), promptVersion:z.literal(registry.promptVersion), evidencePolicyVersion:z.literal(registry.evidencePolicyVersion), retrievalVersion:z.enum([registry.hybrid,registry.retrievalOnly]), hybrid: z.boolean(), generation: z.boolean(), providerModels: z.object({ gemini: z.string(), openai: z.string(), embedding:z.string() }) });
function summarize(cases: Array<{
    id: string;
    kind: string;
}>, results: Array<{
    caseId: string;
    classification: string;
    comparison: unknown;
}>) {
    const classified = (kind: string, label: string) => results.filter(r => r.classification === label && cases.some(c => c.id === r.caseId && c.kind === kind)).length;
    return { total: cases.length, completed: results.length, counts: Object.fromEntries(['IMPROVED', 'UNCHANGED', 'REGRESSED', 'INCONCLUSIVE', 'ERROR'].map(k => [k, results.filter(r => r.classification === k).length])), failures: { passed: classified('FAILURE', 'IMPROVED'), total: cases.filter(c => c.kind === 'FAILURE').length }, guardrails: { preserved: classified('GUARDRAIL', 'UNCHANGED'), total: cases.filter(c => c.kind === 'GUARDRAIL').length }, abstainToSupported: results.filter(r => (r.comparison as {
            abstainToSupported?: boolean;
        }).abstainToSupported).length, supportedToAbstain: results.filter(r => (r.comparison as {
            supportedToAbstain?: boolean;
        }).supportedToAbstain).length };
}
// Retain the process slot until in-flight work actually returns, including cancellation.
const activeOrganizations = new Set<string>();
export async function executeExperiment(userId: string, orgId: string, id: string) {
    if (activeOrganizations.has(orgId)) throw new AppError('An experiment is still executing for this organization',409);
    activeOrganizations.add(orgId);
    try { return await executeBounded(userId, orgId, id); }
    finally { activeOrganizations.delete(orgId); }
}
async function executeBounded(userId: string, orgId: string, id: string) {
    const experiment = await prisma.$transaction(async (tx) => {
        await authorizeKnowledge(tx, userId, orgId, true);
        const e = await tx.evaluationExperiment.findFirst({ where: { id, organizationId: orgId }, include: { suite: { include: { cases: true } }, scope: true } });
        if (!e)
            throw new AppError('Experiment not found', 404);
        if (e.status !== 'DRAFT')
            throw new AppError('An experiment executes once; create a new experiment to rerun', 409);
        if (await tx.evaluationExperiment.count({ where: { organizationId: orgId, status: 'RUNNING' } }))
            throw new AppError('One experiment may run per organization; cancel an interrupted run before retrying', 409);
        await tx.evaluationExperiment.update({ where: { id }, data: { status: 'RUNNING', startedAt: new Date() } });
        return e;
    });
    const deadline = Date.now() + 180000;
    try {
        const config = configuration.parse(experiment.configuration);
        if(config.retrievalVersion !== (config.hybrid ? registry.hybrid : registry.retrievalOnly) || (config.hybrid && config.providerModels.embedding !== env.OPENAI_EMBEDDING_MODEL)) throw new Error("CONFIGURATION_CHANGED");
        if (config.generation && (config.providerModels.gemini !== env.GEMINI_MODEL || config.providerModels.openai !== env.OPENAI_MODEL))
            throw new Error('CONFIGURATION_CHANGED');
        for (const row of experiment.suite.cases) {
            // Recheck cancellation/current membership before provider work and again before storage.
            if (Date.now() > deadline)
                throw new Error("EXECUTION_DEADLINE");
            await prisma.$transaction(tx => authorizeKnowledge(tx, userId, orgId, true));
            if ((await prisma.evaluationExperiment.findUniqueOrThrow({ where: { id } })).status !== 'RUNNING')
                break;
            let result;
            try {
                result = await runEvaluationCase(orgId, row, experiment.scope.map(v => v.documentVersionId), experiment.scope.filter(v => v.override).map(v => v.documentVersionId), config);
            }
            catch {
                result = { candidate: { operationalError: true, errorCode: 'CASE_EXECUTION_FAILED' }, comparison: { classification: 'ERROR' as const, reason: 'Operational failure; no quality conclusion.' }, durationMs: 0 };
                console.warn({ event: 'reliability.case_failed', experimentId: id, caseId: row.id });
            }
            await prisma.$transaction(async (tx) => {
                await authorizeKnowledge(tx, userId, orgId, true);
                if ((await tx.evaluationExperiment.findUniqueOrThrow({ where: { id } })).status === 'RUNNING')
                    await tx.evaluationResult.create({ data: { experimentId: id, caseId: row.id, classification: result.comparison.classification, candidate: json(result.candidate), comparison: json(result.comparison), durationMs: result.durationMs } });
            });
        }
        await prisma.$transaction(async (tx) => {
            await authorizeKnowledge(tx, userId, orgId, true);
            const current = await tx.evaluationExperiment.findUniqueOrThrow({ where: { id }, include: { results: true } });
            if (current.status !== 'RUNNING')
                return;
            const counts = Object.fromEntries(['IMPROVED', 'UNCHANGED', 'REGRESSED', 'INCONCLUSIVE', 'ERROR'].map(k => [k, current.results.filter(r => r.classification === k).length]));
            const complete = current.results.length === experiment.suite.cases.length && !counts.ERROR;
            await tx.evaluationExperiment.update({ where: { id }, data: { status: complete ? 'COMPLETED' : 'FAILED', completedAt: new Date(), summary: json(summarize(experiment.suite.cases, current.results)) } });
        });
    }
    catch {
        console.warn({ event: 'reliability.execution_failed', experimentId: id });
        const results = await prisma.evaluationResult.findMany({ where: { experimentId: id } });
        await prisma.evaluationExperiment.updateMany({ where: { id, organizationId: orgId, status: 'RUNNING' }, data: { status: 'FAILED', errorCode: 'EXECUTION_INTERRUPTED', completedAt: new Date(), summary: json(summarize(experiment.suite.cases, results)) } });
    }
    return getExperiment(userId, orgId, id);
}
export async function cancelExperiment(userId: string, orgId: string, id: string) { return prisma.$transaction(async (tx) => { await authorizeKnowledge(tx, userId, orgId, true); const e = await tx.evaluationExperiment.findFirst({ where: { id, organizationId: orgId }, include: { suite: { include: { cases: true } }, results: true } }); if (!e)
    throw new AppError('Experiment not found', 404); if (!['DRAFT', 'RUNNING'].includes(e.status))
    throw new AppError('Experiment already terminal', 409); return tx.evaluationExperiment.update({ where: { id }, data: { status: 'CANCELLED', completedAt: new Date(), summary: json(summarize(e.suite.cases, e.results)) } }); }); }
export async function verifyIssue(userId: string, orgId: string, issueId: string, experimentId: string) {
    return prisma.$transaction(async (tx) => {
        await authorizeKnowledge(tx, userId, orgId, true);
        const { issue, failureIds, guardrailIds } = await issueCohort(tx, orgId, issueId);
        const e = await tx.evaluationExperiment.findFirst({ where: { id: experimentId, organizationId: orgId }, include: { suite: { include: { cases: true } }, scope: true, results: true } });
        if (!e || e.suite.issueId !== issueId || e.purpose !== 'POST_PUBLICATION_VERIFICATION' || e.status !== 'COMPLETED' || issue.status !== 'PUBLISHED')
            throw new AppError('Completed post-publication experiment required', 409);
        const v = issue.candidateVersion;
        const doc = v ? await tx.knowledgeDocument.findUnique({ where: { id: v.documentId } }) : null;
        if (!v || v.status !== 'PUBLISHED' || doc?.archivedAt || doc?.currentPublishedVersionId !== v.id || !e.scope.some(s => s.override && s.documentVersionId === v.id && s.contentHash === v.contentHash))
            throw new AppError('Experiment must evaluate the exact current published fix', 409);
        // Also reject verification after any other document publication/archive changes the evaluated scope.
        const current = await tx.knowledgeDocument.findMany({ where: { organizationId: orgId, archivedAt: null, currentPublishedVersionId: { not: null } }, select: { currentPublishedVersionId: true } });
        if (current.length !== e.scope.length || current.some(d => !e.scope.some(s => s.documentVersionId === d.currentPublishedVersionId)))
            throw new AppError('Publication scope changed; run a new verification', 409);
        const coverage = (ids: string[], kind: string, classification: string) => ids.every(runId => { const c = e.suite.cases.find(c => c.historicalCopilotRunId === runId && c.kind === kind); return !!c && e.results.some(r => r.caseId === c.id && r.classification === classification); });
        if (!failureIds.length || !guardrailIds.length || e.results.length !== e.suite.cases.length || e.results.some(r => ['ERROR', 'REGRESSED', 'INCONCLUSIVE'].includes(r.classification)) || !coverage(failureIds, 'FAILURE', 'IMPROVED') || !coverage(guardrailIds, 'GUARDRAIL', 'UNCHANGED') || e.suite.cases.some(c => c.kind === 'FAILURE' && !e.results.some(r => r.caseId === c.id && r.classification === 'IMPROVED')))
            throw new AppError('Verification requires every current failure and sampled guardrail to pass without errors or missing coverage', 409);
        await tx.knowledgeIssue.update({ where: { id: issueId }, data: { status: 'VERIFIED', revision: { increment: 1 } } });
        const metadata = { experimentId, documentVersionId: v.id, failureCases: failureIds.length, guardrailCases: guardrailIds.length, verifiedAt: new Date().toISOString(), criteriaVersion: 'support-replay-v1' };
        await tx.knowledgeIssueHistory.create({ data: { issueId, actorIdentity: userId, event: 'VERIFIED', metadata } });
        return metadata;
    }, { timeout: 15000 });
}
