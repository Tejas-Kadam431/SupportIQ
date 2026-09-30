import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma.js";
import { authorizeKnowledge } from "../knowledge-base/kb.version.service.js";
import { KNOWLEDGE_REASONS, OPERATIONAL_STATUSES } from "./issue.classification.js";
import { dateRange, listInput, type DateRange } from "./issue.schema.js";
export function rate(numerator: number, denominator: number) { return { numerator, denominator, percent: denominator ? Math.round(numerator / denominator * 1000) / 10 : 0 }; }
// SQL mirrors the pure classifier and is parity-tested against it. No analytics
// depend on whether the repairable issue-ingestion side effect has run yet.
export function facts(orgId: string, range: DateRange) {
    return Prisma.sql `
 WITH base AS (SELECT r.id,r."ticketId",r."createdAt",r.abstained,r.sources,r."generationDurationMs",e.disposition,e.reason AS "feedbackReason",
 CASE WHEN r."evidencePolicyVersion"='evidence-v2' THEN coalesce(r."outputSnapshot"->>'evidenceDecision','UNKNOWN') ELSE 'LEGACY_UNKNOWN' END AS policy,
 r."providerMetadata" AS metadata
 FROM "CopilotRun" r LEFT JOIN "CopilotEvaluation" e ON e."copilotRunId"=r.id
 WHERE r."organizationId"=${orgId} AND r."createdAt">=${range.from} AND r."createdAt"<${range.to}),
 facts AS (SELECT *, CASE WHEN policy IN ('NEEDS_CUSTOMER_INFO','RETRIEVAL_DEGRADED') THEN NULL
 WHEN abstained AND policy IN ('INSUFFICIENT_KNOWLEDGE','CONFLICTING_KNOWLEDGE') THEN policy
 WHEN disposition<>'ACCEPTED' AND "feedbackReason"::text IN (${Prisma.join([...KNOWLEDGE_REASONS])}) THEN "feedbackReason"::text ELSE NULL END AS "knowledgeReason",
 (policy='RETRIEVAL_DEGRADED' OR coalesce(metadata#>>'{retrieval,semanticStatus}','') IN (${Prisma.join(OPERATIONAL_STATUSES)}) OR coalesce(metadata#>>'{retrieval,lexicalStatus}','') IN (${Prisma.join(OPERATIONAL_STATUSES)}) OR EXISTS(SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(metadata->'attempts')='array' THEN metadata->'attempts' ELSE '[]'::jsonb END) a WHERE a->>'outcome'='FAILED')) AS operational
 FROM base)`;
}
export async function qualityOverview(userId: string, orgId: string, input: unknown = {}) {
    await authorizeKnowledge(prisma, userId, orgId);
    const range = dateRange(input);
    const [row] = await prisma.$queryRaw<Array<{
        totalRuns: number;
        eligibleRuns: number;
        evaluatedRuns: number;
        accepted: number;
        edited: number;
        rejected: number;
        abstained: number;
        knowledgeFailures: number;
        affectedTickets: number;
        operationalFailures: number;
        averageLatencyMs: number | null;
        latencySamples: number;
    }>> `${facts(orgId, range)} SELECT count(*)::int AS "totalRuns",count(*)::int AS "eligibleRuns",count(disposition)::int AS "evaluatedRuns",count(*) FILTER(WHERE disposition='ACCEPTED')::int AS accepted,count(*) FILTER(WHERE disposition='EDITED')::int AS edited,count(*) FILTER(WHERE disposition='REJECTED')::int AS rejected,count(*) FILTER(WHERE abstained)::int AS abstained,count("knowledgeReason")::int AS "knowledgeFailures",count(DISTINCT "ticketId") FILTER(WHERE "knowledgeReason" IS NOT NULL)::int AS "affectedTickets",count(*) FILTER(WHERE operational)::int AS "operationalFailures",avg("generationDurationMs")::float8 AS "averageLatencyMs",count("generationDurationMs")::int AS "latencySamples" FROM facts`;
    const outcomes = await prisma.$queryRaw<Array<{
        policy: string;
        count: number;
        abstained: number;
    }>> `${facts(orgId, range)} SELECT policy,count(*)::int AS count,count(*) FILTER(WHERE abstained)::int AS abstained FROM facts GROUP BY policy`;
    const reasons = await prisma.$queryRaw<Array<{
        reason: string;
        count: number;
    }>> `${facts(orgId, range)} SELECT "feedbackReason"::text AS reason,count(*)::int AS count FROM facts WHERE "feedbackReason" IS NOT NULL GROUP BY "feedbackReason" ORDER BY count(*) DESC`;
    const retrievalHealth = await prisma.$queryRaw<Array<{
        semantic: string;
        lexical: string;
        count: number;
    }>> `${facts(orgId, range)} SELECT coalesce(metadata#>>'{retrieval,semanticStatus}','UNKNOWN') AS semantic,coalesce(metadata#>>'{retrieval,lexicalStatus}','UNKNOWN') AS lexical,count(*)::int AS count FROM facts GROUP BY semantic,lexical`;
    // Every persisted run is feedback-eligible: even abstained runs can be rejected.
    return { ...row, range, evaluationCoverage: rate(row.evaluatedRuns, row.totalRuns), acceptance: rate(row.accepted, row.evaluatedRuns), edit: rate(row.edited, row.evaluatedRuns), rejection: rate(row.rejected, row.evaluatedRuns), abstention: rate(row.abstained, row.totalRuns), outcomes, retrievalHealth, failureReasons: Object.fromEntries(reasons.map(r => [r.reason, r.count])), acceptanceRate: Math.round(rate(row.accepted, row.evaluatedRuns).percent), abstentionRate: Math.round(rate(row.abstained, row.totalRuns).percent) };
}
export async function sourceHealth(userId: string, orgId: string, input: unknown = {}, page = 1) {
    await authorizeKnowledge(prisma, userId, orgId);
    const range = dateRange(input);
    page = listInput.parse({ page }).page;
    const rows = await prisma.$queryRaw<Array<{
        documentId: string;
        documentName: string;
        versionId: string;
        versionNumber: number;
        status: string;
        isCurrent: boolean;
        runsUsingSource: number;
        evaluatedRuns: number;
        acceptedRuns: number;
        editedRuns: number;
        rejectedRuns: number;
        knowledgeFailureRuns: number;
        knowledgeFailureEvaluatedRuns: number;
        wrongKnowledgeRuns: number;
        irrelevantEvidenceRuns: number;
        conflictingKnowledgeRuns: number;
        issueCount: number;
    }>> `${facts(orgId, range)},
 uses AS (SELECT DISTINCT f.id,src->>'documentVersionId' AS version FROM facts f CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(f.sources)='array' THEN f.sources ELSE '[]'::jsonb END) src
 WHERE src->'evidenceEligible'='true'::jsonb AND EXISTS(SELECT 1 FROM "CopilotKnowledgeSource" k WHERE k."copilotRunId"=f.id AND k."documentVersionId"=src->>'documentVersionId')),
 use_counts AS (SELECT id,count(*) AS n FROM uses GROUP BY id),
 attributed AS (SELECT f.*,u.version,(f."knowledgeReason"='CONFLICTING_KNOWLEDGE' OR (n=1 AND f."knowledgeReason" IN ('WRONG_KNOWLEDGE','IRRELEVANT_EVIDENCE'))) AS blamed FROM uses u JOIN facts f ON f.id=u.id JOIN use_counts c ON c.id=u.id)
 SELECT d.id AS "documentId",d."originalName" AS "documentName",v.id AS "versionId",v."versionNumber",v.status::text AS status,(d."currentPublishedVersionId"=v.id AND d."archivedAt" IS NULL) AS "isCurrent",
 count(*)::int AS "runsUsingSource",count(a.disposition)::int AS "evaluatedRuns",count(*) FILTER(WHERE disposition='ACCEPTED')::int AS "acceptedRuns",count(*) FILTER(WHERE disposition='EDITED')::int AS "editedRuns",count(*) FILTER(WHERE disposition='REJECTED')::int AS "rejectedRuns",
 count(*) FILTER(WHERE blamed)::int AS "knowledgeFailureRuns",count(*) FILTER(WHERE blamed AND disposition IS NOT NULL)::int AS "knowledgeFailureEvaluatedRuns",count(*) FILTER(WHERE blamed AND "knowledgeReason"='WRONG_KNOWLEDGE')::int AS "wrongKnowledgeRuns",count(*) FILTER(WHERE blamed AND "knowledgeReason"='IRRELEVANT_EVIDENCE')::int AS "irrelevantEvidenceRuns",count(*) FILTER(WHERE blamed AND "knowledgeReason"='CONFLICTING_KNOWLEDGE')::int AS "conflictingKnowledgeRuns",
 (SELECT count(DISTINCT s."issueId")::int FROM "KnowledgeIssueSource" ks JOIN "KnowledgeIssueSignal" s ON s.id=ks."signalId" WHERE ks."documentVersionId"=v.id) AS "issueCount"
 FROM attributed a JOIN "KnowledgeDocumentVersion" v ON v.id=a.version JOIN "KnowledgeDocument" d ON d.id=v."documentId" WHERE d."organizationId"=${orgId}
 GROUP BY d.id,v.id ORDER BY count(*) FILTER(WHERE blamed AND disposition IS NOT NULL) DESC,count(*) DESC,v.id LIMIT 26 OFFSET ${(page - 1) * 25}`;
    return { range, page, hasMore: rows.length > 25, sources: rows.slice(0, 25).map(r => ({ ...r, limitedData: r.evaluatedRuns < 10, observedFailureRate: rate(r.knowledgeFailureEvaluatedRuns, r.evaluatedRuns), signalRate: rate(r.knowledgeFailureRuns, r.runsUsingSource) })), legacyAttribution: "Legacy sources without verified version identity are excluded" };
}
export async function listIssues(userId: string, orgId: string, input: unknown = {}) {
    await authorizeKnowledge(prisma, userId, orgId);
    const query = listInput.parse(input);
    const rows = await prisma.$queryRaw<Array<{
        id: string;
        title: string;
        reason: string;
        status: string;
        revision: number;
        severity: string;
        signalCount: number;
        affectedTicketCount: number;
        firstDetectedAt: Date;
        lastDetectedAt: Date;
        assigneeName: string | null;
        assigneeUserId: string | null;
        sourceCount: number;
    }>> `
 WITH counts AS (SELECT i.id,count(s.id)::int AS "signalCount",count(DISTINCT r."ticketId")::int AS "affectedTicketCount",coalesce(min(s."occurredAt"),i."createdAt") AS "firstDetectedAt",coalesce(max(s."occurredAt"),i."createdAt") AS "lastDetectedAt" FROM "KnowledgeIssue" i LEFT JOIN "KnowledgeIssueSignal" s ON s."issueId"=i.id LEFT JOIN "CopilotRun" r ON r.id=s."copilotRunId" WHERE i."organizationId"=${orgId} GROUP BY i.id),
 ranked AS (SELECT *,CASE WHEN "affectedTicketCount">=6 THEN 'HIGH' WHEN "affectedTicketCount">=3 THEN 'MEDIUM' ELSE 'LOW' END AS severity FROM counts)
 SELECT i.id,i.title,i.reason,i.status::text AS status,i.revision,c.severity,c."signalCount",c."affectedTicketCount",c."firstDetectedAt",c."lastDetectedAt",u.name AS "assigneeName",u.id AS "assigneeUserId",
 (SELECT count(DISTINCT ks."documentVersionId")::int FROM "KnowledgeIssueSignal" s JOIN "KnowledgeIssueSource" ks ON ks."signalId"=s.id WHERE s."issueId"=i.id) AS "sourceCount"
 FROM "KnowledgeIssue" i JOIN ranked c ON c.id=i.id LEFT JOIN "OrganizationMember" m ON m.id=i."assigneeMemberId" LEFT JOIN "User" u ON u.id=m."userId"
 WHERE i."organizationId"=${orgId} AND (${query.status ?? null}::text IS NULL OR i.status::text=${query.status ?? null}) AND (${query.severity ?? null}::text IS NULL OR c.severity=${query.severity ?? null}) AND (${query.assignee ?? null}::text IS NULL OR u.id=${query.assignee ?? null})
 AND (${query.versionId ?? null}::text IS NULL OR EXISTS(SELECT 1 FROM "KnowledgeIssueSignal" vs JOIN "KnowledgeIssueSource" ks ON ks."signalId"=vs.id WHERE vs."issueId"=i.id AND ks."documentVersionId"=${query.versionId ?? null}))
 ORDER BY c."affectedTicketCount" DESC,c."signalCount" DESC,c."lastDetectedAt" DESC,i.id LIMIT 26 OFFSET ${(query.page - 1) * 25}`;
    return { issues: rows.slice(0, 25), page: query.page, hasMore: rows.length > 25 };
}
export async function listQualityRuns(userId: string, orgId: string, input: unknown = {}, page = 1) {
    await authorizeKnowledge(prisma, userId, orgId);
    const range = dateRange(input);
    page = listInput.parse({ page }).page;
    const runs = await prisma.copilotRun.findMany({ where: { organizationId: orgId, createdAt: { gte: range.from, lt: range.to } }, select: { id: true, ticketId: true, createdAt: true, abstained: true, evidencePolicyVersion: true, evaluation: { select: { disposition: true, reason: true } }, knowledgeSignal: { select: { issueId: true } } }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (page - 1) * 25, take: 26 });
    return { range, runs: runs.slice(0, 25), page, hasMore: runs.length > 25 };
}
