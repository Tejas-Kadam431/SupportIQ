import { api } from "../../app/api";
export type Rate = {
    numerator: number;
    denominator: number;
    percent: number;
};
export type IssueStatus = "DETECTED" | "REVIEWING" | "FIX_PROPOSED" | "PUBLISHED" | "VERIFIED" | "DISMISSED";
export type Issue = {
    id: string;
    title: string;
    reason: string;
    status: IssueStatus;
    revision: number;
    severity: string;
    signalCount: number;
    affectedTicketCount: number;
    firstDetectedAt: string;
    lastDetectedAt: string;
    assigneeName: string | null;
    assigneeUserId: string | null;
    sourceCount: number;
};
export type IssueDetail = Issue & {
    fixNote: string | null;
    dismissalReason: string | null;
    recurringAfterPublication: boolean;
    hasMore: boolean;
    assignee: {
        user: {
            id: string;
            name: string;
        };
    } | null;
    candidateVersion: {
        id: string;
        documentId: string;
        versionNumber: number;
        originalName: string;
        status: string;
        publishedAt: string | null;
    } | null;
    signals: Array<{
        id: string;
        reason: string;
        occurredAt: string;
        run: {
            id: string;
            ticketId: string;
        };
        sources: Array<{
            attributed: boolean;
            version: {
                id: string;
                documentId: string;
                versionNumber: number;
                originalName: string;
                status: string;
            };
        }>;
    }>;
    history: Array<{
        id: string;
        event: string;
        actorIdentity: string | null;
        createdAt: string;
        metadata: {
            note?: string; failureCases?: number; guardrailCases?: number; experimentId?: string;
            from?: string;
            to?: string;
        };
    }>;
};
export type QualityOverview = {
    totalRuns: number;
    evaluatedRuns: number;
    accepted: number;
    edited: number;
    rejected: number;
    knowledgeFailures: number;
    affectedTickets: number;
    operationalFailures: number;
    averageLatencyMs: number | null;
    latencySamples: number;
    evaluationCoverage: Rate;
    acceptance: Rate;
    edit: Rate;
    rejection: Rate;
    abstention: Rate;
    outcomes: Array<{
        policy: string;
        count: number;
        abstained: number;
    }>;
    retrievalHealth: Array<{
        semantic: string;
        lexical: string;
        count: number;
    }>;
    failureReasons: Record<string, number>;
};
export type SourceHealth = {
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
    wrongKnowledgeRuns: number;
    irrelevantEvidenceRuns: number;
    conflictingKnowledgeRuns: number;
    limitedData: boolean;
    observedFailureRate: Rate;
    signalRate: Rate;
    issueCount: number;
};
export type QualityRun = {
    id: string;
    ticketId: string;
    createdAt: string;
    abstained: boolean;
    evaluation: {
        disposition: string;
        reason: string | null;
    } | null;
    knowledgeSignal: {
        issueId: string;
    } | null;
};
export type RunDetail = {
    id: string;
    suggestedReply: string | null;
    sources: Array<{
        documentName?: string;
        versionNumber?: number;
        content?: string;
        contentHash?: string;
    }>;
    evaluation: {
        disposition: string;
        reason: string | null;
        finalMessage: string | null;
    } | null;
};
const params = (input: Record<string, string | number | undefined>) => new URLSearchParams(Object.entries(input).filter(([, v]) => v !== undefined && v !== "").map(([k, v]) => [k, String(v)])).toString();
const base = (orgId: string) => `/organizations/${orgId}/quality`;
export const qualityApi = api.injectEndpoints({ endpoints: builder => ({
        qualityAssignees: builder.query<{
            data: Array<{
                user: {
                    id: string;
                    name: string;
                };
            }>;
        }, string>({ query: orgId => base(orgId) + "/assignees", providesTags: ["Organizations"] }),
        qualityOverview: builder.query<{
            data: QualityOverview;
        }, {
            orgId: string;
            days: number;
        }>({ query: ({ orgId, days }) => base(orgId) + `/overview?days=${days}`, providesTags: ["Dashboard"] }),
        qualitySources: builder.query<{
            data: {
                sources: SourceHealth[];
                hasMore: boolean;
            };
        }, {
            orgId: string;
            days: number;
            page: number;
        }>({ query: ({ orgId, ...rest }) => base(orgId) + '/sources?' + params(rest), providesTags: ["Dashboard"] }),
        qualityIssues: builder.query<{
            data: {
                issues: Issue[];
                hasMore: boolean;
            };
        }, {
            orgId: string;
            page: number;
            status?: string;
            severity?: string;
            assignee?: string;
            versionId?: string;
        }>({ query: ({ orgId, ...rest }) => base(orgId) + '/issues?' + params(rest), providesTags: ["Dashboard"] }),
        qualityIssue: builder.query<{
            data: IssueDetail;
        }, {
            orgId: string;
            issueId: string;
            page: number;
        }>({ query: ({ orgId, issueId, page }) => base(orgId) + `/issues/${issueId}?page=${page}`, providesTags: ["Dashboard", "KnowledgeBase"] }),
        updateQualityIssue: builder.mutation<unknown, {
            orgId: string;
            issueId: string;
            expectedRevision: number;
            status?: IssueStatus;
            assignedToUserId?: string | null;
            candidateVersionId?: string;
            note?: string;
            dismissalReason?: string;
        }>({ query: ({ orgId, issueId, ...body }) => ({ url: base(orgId) + `/issues/${issueId}`, method: "PATCH", body }), invalidatesTags: ["Dashboard"] }),
        qualityRuns: builder.query<{
            data: {
                runs: QualityRun[];
                hasMore: boolean;
            };
        }, {
            orgId: string;
            days: number;
            page: number;
        }>({ query: ({ orgId, ...rest }) => base(orgId) + '/runs?' + params(rest), providesTags: ["Dashboard"] }),
        qualityRun: builder.query<{
            data: {
                run: RunDetail;
            };
        }, {
            ticketId: string;
            runId: string;
        }>({ query: ({ ticketId, runId }) => `/tickets/${ticketId}/copilot-runs/${runId}`, providesTags: ["Dashboard"] })
    }) });
export const { useQualityAssigneesQuery, useQualityOverviewQuery, useQualitySourcesQuery, useQualityIssuesQuery, useQualityIssueQuery, useUpdateQualityIssueMutation, useQualityRunsQuery, useQualityRunQuery } = qualityApi;
