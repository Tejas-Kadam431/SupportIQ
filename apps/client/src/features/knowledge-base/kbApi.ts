import { api } from "../../app/api";
import type { UserSummary } from "../tickets/ticketsApi";
export type KnowledgeDocumentStatus = "UPLOADED" | "PROCESSING" | "READY" | "FAILED";
export type KnowledgeVersion = {
    id: string;
    versionNumber: number;
    status: "UPLOADED" | "PROCESSING" | "READY" | "PUBLISHED" | "SUPERSEDED" | "FAILED";
    createdAt: string;
    publishedAt: string | null;
    errorMessage: string | null;
    sourceHash?: string | null;
    contentHash?: string | null;
    ingestion?: {
        stage: string;
        attempts: number;
        retryable: boolean;
        errorCategory: string | null;
        startedAt: string | null;
        lexicalReady: boolean;
        semanticReady: boolean;
        chunksTotal: number;
        chunksEmbedded: number;
    } | null;
};
export type KnowledgeDocument = {
    currentPublishedVersionId: string | null;
    currentPublishedVersion: KnowledgeVersion | null;
    versions: KnowledgeVersion[];
    archivedAt: string | null;
    id: string;
    organizationId: string;
    uploadedById: string;
    fileName: string;
    originalName: string;
    mimeType: string;
    sizeBytes: number;
    storagePath: string;
    status: KnowledgeDocumentStatus;
    errorMessage: string | null;
    createdAt: string;
    updatedAt: string;
    uploadedBy: UserSummary;
    _count?: {
        chunks: number;
    };
};
export type KnowledgeSearchResult = {
    id: string;
    documentId: string;
    chunkIndex: number;
    content: string;
    tokenCount: number;
    score: number;
    document: {
        originalName: string;
    };
};
export type ListDocumentsResponse = {
    data: {
        documents: KnowledgeDocument[];
    };
};
export type UploadDocumentResponse = {
    message: string;
    data: {
        document: KnowledgeDocument;
    };
};
export type ReprocessDocumentResponse = {
    message: string;
    data: {
        document: KnowledgeDocument;
    };
};
export type SearchKnowledgeResponse = {
    data: {
        query: string;
        results: KnowledgeSearchResult[];
        total: number;
    };
};
export const kbApi = api.injectEndpoints({
    endpoints: (builder) => ({
        knowledgeVersions: builder.query<{
            data: {
                document: KnowledgeDocument;
            };
        }, {
            orgId: string;
            documentId: string; page?: number;
        }>({ query: ({ orgId, documentId, page = 1 }) => `/organizations/${orgId}/kb/documents/${documentId}/versions?page=${page}`, providesTags: ["KnowledgeBase"] }),
        uploadKnowledgeVersion: builder.mutation<UploadDocumentResponse, {
            orgId: string;
            documentId: string;
            file: File;
        }>({ query: ({ orgId, documentId, file }) => { const body = new FormData(); body.append("file", file); return { url: `/organizations/${orgId}/kb/documents/${documentId}/versions`, method: "POST", body }; }, invalidatesTags: ["KnowledgeBase"] }),
        publishKnowledgeVersion: builder.mutation<unknown, {
            orgId: string;
            documentId: string;
            versionId: string;
            expectedCurrentVersionId: string | null;
        }>({ query: ({ orgId, documentId, versionId, expectedCurrentVersionId }) => ({ url: `/organizations/${orgId}/kb/documents/${documentId}/versions/${versionId}/publish`, method: "POST", body: { expectedCurrentVersionId } }), invalidatesTags: ["KnowledgeBase"] }),
        listKnowledgeDocuments: builder.query<ListDocumentsResponse, string | { orgId: string; page: number }>({
            query: (arg) => typeof arg === "string" ? `/organizations/${arg}/kb/documents` : `/organizations/${arg.orgId}/kb/documents?page=${arg.page}`,
            providesTags: ["KnowledgeBase"]
        }),
        uploadKnowledgeDocument: builder.mutation<UploadDocumentResponse, {
            orgId: string;
            file: File;
        }>({
            query: ({ orgId, file }) => {
                const formData = new FormData();
                formData.append("file", file);
                return {
                    url: `/organizations/${orgId}/kb/documents`,
                    method: "POST",
                    body: formData
                };
            },
            invalidatesTags: ["KnowledgeBase"]
        }),
        deleteKnowledgeDocument: builder.mutation<{
            message: string;
        }, {
            orgId: string;
            documentId: string;
        }>({
            query: ({ orgId, documentId }) => ({
                url: `/organizations/${orgId}/kb/documents/${documentId}`,
                method: "DELETE"
            }),
            invalidatesTags: ["KnowledgeBase"]
        }),
        reprocessKnowledgeDocument: builder.mutation<ReprocessDocumentResponse, {
            orgId: string;
            documentId: string;
            versionId?: string;
        }>({
            query: ({ orgId, documentId, versionId }) => ({
                url: `/organizations/${orgId}/kb/documents/${documentId}${versionId ? `/versions/${versionId}` : ""}/process`,
                method: "POST"
            }),
            invalidatesTags: ["KnowledgeBase"]
        }),
        searchKnowledgeBase: builder.query<SearchKnowledgeResponse, {
            orgId: string;
            q: string;
            limit?: number;
        }>({
            query: ({ orgId, q, limit = 10 }) => {
                const searchParams = new URLSearchParams();
                searchParams.set("q", q);
                searchParams.set("limit", String(limit));
                return `/organizations/${orgId}/kb/search?${searchParams.toString()}`;
            },
            providesTags: ["KnowledgeBase"]
        })
    })
});
export const { useKnowledgeVersionsQuery, useUploadKnowledgeVersionMutation, usePublishKnowledgeVersionMutation, useListKnowledgeDocumentsQuery, useUploadKnowledgeDocumentMutation, useDeleteKnowledgeDocumentMutation, useReprocessKnowledgeDocumentMutation, useSearchKnowledgeBaseQuery } = kbApi;
