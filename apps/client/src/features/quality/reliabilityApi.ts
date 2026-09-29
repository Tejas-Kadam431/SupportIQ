import { api } from '../../app/api';
export type ReplayCase = {
    id: string;
    kind: string;
    historicalCopilotRunId: string;
    input: unknown;
    baseline: {
        suggestedReply: string | null;
        finalMessage: string | null;
        disposition: string | null;
        decision: string | null;
        sources: unknown[];
    };
};
export type Experiment = {
    id: string;
    name: string;
    status: string;
    purpose: string;
    actorIdentity: string;
    createdAt: string;
    configuration: unknown;
    summary: {
        total: number;
        completed: number;
        counts?: Record<string, number>;
        failures?: {
            passed: number;
            total: number;
        };
        guardrails?: {
            preserved: number;
            total: number;
        };
    };
    suite: {
        id: string;
        name: string;
        issueId: string | null;
        cases?: ReplayCase[];
        _count?: {
            cases: number;
        };
    };
    scope: Array<{
        documentVersionId: string;
        override: boolean;
        version: {
            versionNumber: number;
            originalName: string;
            status?: string;
        };
    }>;
    results?: Array<{
        caseId: string;
        classification: string;
        candidate: unknown;
        comparison: unknown;
        durationMs: number;
    }>;
};
export type Suite = {
    id: string;
    name: string;
    issueId: string | null;
    _count: {
        cases: number;
    };
};
const root = (orgId: string) => `/organizations/${orgId}/reliability`;
const reliabilityApi = api.injectEndpoints({ endpoints: builder => ({
        replayExperiments: builder.query<{
            data: {
                experiments: Experiment[];
                hasMore: boolean;
            };
        }, {
            orgId: string;
            page?: number;
            status?: string;
            purpose?: string;
            issueId?: string;
            from?: string;
            to?: string;
        }>({ query: ({ orgId, ...query }) => ({ url: root(orgId) + '/experiments', params: Object.fromEntries(Object.entries(query).filter(([, v]) => v !== '' && v !== undefined)) }), providesTags: ['Dashboard'] }),
        replayExperiment: builder.query<{
            data: Experiment;
        }, {
            orgId: string;
            id: string;
        }>({ query: ({ orgId, id }) => root(orgId) + '/experiments/' + id, providesTags: ['Dashboard'] }),
        replaySuites: builder.query<{
            data: {
                suites: Suite[];
                hasMore: boolean;
            };
        }, {
            orgId: string;
            page: number;
        }>({ query: ({ orgId, page }) => ({ url: root(orgId) + '/suites', params: { page } }), providesTags: ['Dashboard'] }),
        createReplaySuite: builder.mutation<{
            data: Suite;
        }, {
            orgId: string;
            body: Record<string, unknown>;
        }>({ query: ({ orgId, body }) => ({ url: root(orgId) + '/suites', method: 'POST', body }), invalidatesTags: ['Dashboard'] }),
        createReplayExperiment: builder.mutation<{
            data: Experiment;
        }, {
            orgId: string;
            body: Record<string, unknown>;
        }>({ query: ({ orgId, body }) => ({ url: root(orgId) + '/experiments', method: 'POST', body }), invalidatesTags: ['Dashboard'] }),
        replayAction: builder.mutation<{
            data: unknown;
        }, {
            orgId: string;
            id: string;
            action: 'execute' | 'cancel';
        }>({ query: ({ orgId, id, action }) => ({ url: root(orgId) + '/experiments/' + id + '/' + action, method: 'POST' }), invalidatesTags: ['Dashboard'] }),
        verifyReplay: builder.mutation<{
            data: {
                failureCases: number;
                guardrailCases: number;
            };
        }, {
            orgId: string;
            id: string;
            issueId: string;
        }>({ query: ({ orgId, id, issueId }) => ({ url: root(orgId) + '/issues/' + issueId + '/verify/' + id, method: 'POST' }), invalidatesTags: ['Dashboard'] })
    }) });
export const { useReplayExperimentsQuery, useReplayExperimentQuery, useReplaySuitesQuery, useCreateReplaySuiteMutation, useCreateReplayExperimentMutation, useReplayActionMutation, useVerifyReplayMutation } = reliabilityApi;
