import { PrismaClient } from '@prisma/client';
import { createSeedKnowledge } from './seedKnowledge.js';
import { contentHash } from '../src/common/utils/contentHash.js';
import { registry } from '../src/modules/reliability/replay.schema.js';
import { runEvaluationCase } from '../src/modules/reliability/replay.case.js';
import { json } from '../src/modules/reliability/replay.service.js';
import { env } from '../src/config/env.js';
// Operator seed only. UI/API demo identities cannot execute or mutate replay.
// These are explicitly illustrative histories; candidate results use the real no-provider runner.
export async function seedReliabilityLab(db: PrismaClient, orgId: string, ownerId: string, customerId: string) {
    const base = 'Monthly subscription cancellation policy. Monthly subscriptions may be cancelled at the billing portal.';
    const annual = 'Annual subscription refund eligibility policy. Annual subscriptions qualify for a refund within 30 days.';
    const exception = 'Annual refund military deployment exception eligibility. Military deployment annual subscriptions qualify for exception review.';
    const doc = await createSeedKnowledge(db, { data: { organizationId: orgId, uploadedById: ownerId, fileName: 'demo-replay-policy', originalName: 'DEMO — Subscription policy', mimeType: 'text/plain', sizeBytes: base.length, storagePath: 'seeded:no-original-file', status: 'READY', chunks: { create: [{ organizationId: orgId, chunkIndex: 0, tokenCount: 20, content: base }] } } });
    async function version(number: number, text: string) { return db.knowledgeDocumentVersion.create({ data: { documentId: doc.id, versionNumber: number, status: 'READY', originalName: 'DEMO — Subscription policy', mimeType: 'text/plain', sizeBytes: text.length, storageRef: 'seeded:no-original-file', contentHash: contentHash(text), extractedText: text, createdByIdentity: ownerId, semanticIndexedChunks: 0, chunks: { create: { organizationId: orgId, documentId: doc.id, chunkIndex: 0, tokenCount: Math.ceil(text.length / 4), content: text, contentHash: contentHash(text) } } } }); }
    const v2 = await version(2, base + ' ' + annual), v3 = await version(3, base + ' ' + annual + ' ' + exception);
    await db.knowledgeDocument.update({ where: { id: doc.id }, data: { nextVersionNumber: 4 } });
    const issue = await db.knowledgeIssue.create({ data: { organizationId: orgId, groupingKey: 'DEMO-reliability-annual', normalizedTopic: 'demo annual refund eligibility', title: 'DEMO — Annual refund eligibility unclear', reason: 'INSUFFICIENT_KNOWLEDGE', status: 'FIX_PROPOSED', candidateVersionId: v2.id, fixNote: 'Illustrative seeded history, not production customer evidence.' } });
    const original = await db.knowledgeDocumentVersion.findUniqueOrThrow({where:{id:doc.currentPublishedVersionId!},include:{chunks:true}});
    const cases = [];
    for (let i = 0; i < 16; i++) {
        const kind = i < 6 ? 'FAILURE' : 'GUARDRAIL', query = i === 5 ? 'annual refund military deployment exception eligibility' : i < 6 ? 'annual subscription refund eligibility policy' : 'monthly subscription cancellation policy';
        const input = { ticket: { title: 'DEMO — ' + query, description: query, status: 'OPEN', priority: 'MEDIUM', customerName: 'Illustrative customer' }, conversation: [], tone: 'PROFESSIONAL', retrievalQuery: query };
        const ticket = await db.ticket.create({ data: { organizationId: orgId, customerId, title: input.ticket.title, description: query } });
        const sources=i<6?[]:[{documentId:doc.id,documentVersionId:original.id,versionNumber:original.versionNumber,chunkId:original.chunks[0].id,evidenceEligible:true,content:base}];
        const decision = i < 6 ? 'INSUFFICIENT_KNOWLEDGE' : 'ANSWER_SUPPORTED';
        const run = await db.copilotRun.create({ data: { organizationId: orgId, ticketId: ticket.id, provider: 'seeded-illustration', confidence: i < 6 ? 'LOW' : 'MEDIUM', tone: 'PROFESSIONAL', topic: 'DEMO annual refund eligibility', issueSummary: 'Illustrative seeded case', missingInformation: [], recommendedAction: 'Review', suggestedReply: i < 6 ? null : 'You can cancel through the billing portal.', abstained: i < 6, searchQuery: query, searchMode: 'keyword', sourceCount: sources.length, sources, knowledgeSources:{create:sources.map(s=>({documentVersionId:s.documentVersionId,chunkId:s.chunkId}))}, warnings: ['Seeded illustrative history'], provenanceVersion: 1, inputSnapshot: input, outputSnapshot: { evidenceDecision: decision }, evidencePolicyVersion: 'evidence-v2', ...(i >= 6 ? { evaluation: { create: { disposition: 'ACCEPTED', finalMessage: 'You can cancel through the billing portal.' } } } : {}) } });
        if (i < 6)
            await db.knowledgeIssueSignal.create({ data: { issueId: issue.id, copilotRunId: run.id, reason: 'INSUFFICIENT_KNOWLEDGE', classifierVersion: 'demo-illustration-v1', occurredAt: run.createdAt } });
        cases.push({ historicalCopilotRunId: run.id, kind, input: json(input), baseline: json({ decision, evidenceLevel: i < 6 ? 'INSUFFICIENT' : 'LIMITED', sources, suggestedReply: run.suggestedReply, disposition: i < 6 ? null : 'ACCEPTED', reason: null, issueReason: 'INSUFFICIENT_KNOWLEDGE', finalMessage: run.suggestedReply, illustrative: true }) });
    }
    const suite = await db.evaluationSuite.create({ data: { organizationId: orgId, issueId: issue.id, name: 'DEMO — 6 failure cases + 10 guardrails (illustrative)', actorIdentity: ownerId, sampling: { source: 'SEEDED_ILLUSTRATION', failureCount: 6, guardrailCount: 10 }, cases: { create: cases } }, include: { cases: true } });
    async function execute(versionId: string, purpose: 'PRE_PUBLICATION' | 'POST_PUBLICATION_VERIFICATION', name: string) {
        const versions = await db.knowledgeDocumentVersion.findMany({ where: { OR: [{ id: versionId }, { status: 'PUBLISHED', document: { organizationId: orgId, id: { not: doc.id }, archivedAt: null } }] } });
        const config = { ...registry, generation: false, hybrid: false, illustrative: true, providerModels: { gemini: env.GEMINI_MODEL, openai: env.OPENAI_MODEL, embedding: env.OPENAI_EMBEDDING_MODEL }, retrievalVersion: registry.retrievalOnly };
        const e = await db.evaluationExperiment.create({ data: { organizationId: orgId, suiteId: suite.id, name, purpose, actorIdentity: ownerId, configuration: json(config), summary: { total: 16, completed: 0 }, scope: { create: versions.map(v => ({ documentVersionId: v.id, override: v.id === versionId, contentHash: v.contentHash! })) } } });
        await db.evaluationExperiment.update({ where: { id: e.id }, data: { status: 'RUNNING', startedAt: new Date() } });
        const results: Array<Awaited<ReturnType<typeof runEvaluationCase>> & {
            kind: string;
        }> = [];
        for (const row of suite.cases) {
            const r = await runEvaluationCase(orgId, row, versions.map(v => v.id), [versionId], config);
            results.push({ kind: row.kind, ...r });
            await db.evaluationResult.create({ data: { experimentId: e.id, caseId: row.id, classification: r.comparison.classification, candidate: json(r.candidate), comparison: json(r.comparison), durationMs: r.durationMs } });
        }
        const failures = results.filter(r => r.kind === 'FAILURE' && r.comparison.classification === 'IMPROVED').length, guards = results.filter(r => r.kind === 'GUARDRAIL' && r.comparison.classification === 'UNCHANGED').length;
        await db.evaluationExperiment.update({ where: { id: e.id }, data: { status: results.some(r => r.comparison.classification === 'ERROR') ? 'FAILED' : 'COMPLETED', completedAt: new Date(), summary: json({ total: 16, completed: 16, counts: Object.fromEntries(['IMPROVED', 'UNCHANGED', 'REGRESSED', 'INCONCLUSIVE', 'ERROR'].map(c => [c, results.filter(r => r.comparison.classification === c).length])), failures: { passed: failures, total: 6 }, guardrails: { preserved: guards, total: 10 } }) } });
        return { id: e.id, failures, guards };
    }
    await execute(v2.id, 'PRE_PUBLICATION', 'DEMO — Staged policy: inspect the remaining exception');
    await db.$transaction(async (tx) => { await tx.knowledgeDocumentVersion.update({ where: { id: doc.currentPublishedVersionId! }, data: { status: 'SUPERSEDED' } }); await tx.knowledgeDocumentVersion.update({ where: { id: v3.id }, data: { status: 'PUBLISHED', publishedAt: new Date() } }); await tx.knowledgeDocument.update({ where: { id: doc.id }, data: { currentPublishedVersionId: v3.id } }); await tx.knowledgeIssue.update({ where: { id: issue.id }, data: { status: 'PUBLISHED', candidateVersionId: v3.id, publishedAt: new Date(), revision: { increment: 1 } } }); });
    const post = await execute(v3.id, 'POST_PUBLICATION_VERIFICATION', 'DEMO — Published policy: historical coverage check');
    if (post.failures === 6 && post.guards === 10) {
        await db.knowledgeIssue.update({ where: { id: issue.id }, data: { status: 'VERIFIED', revision: { increment: 1 } } });
        await db.knowledgeIssueHistory.create({ data: { issueId: issue.id, actorIdentity: ownerId, event: 'VERIFIED', metadata: { experimentId: post.id, documentVersionId: v3.id, failureCases: 6, guardrailCases: 10, illustrative: true, criteriaVersion: registry.id, verifiedAt: new Date().toISOString() } } });
    }
}
