import { api } from "../../app/api";
import type { UserSummary } from "../tickets/ticketsApi";

export type KnowledgeDocumentStatus =
  | "UPLOADED"
  | "PROCESSING"
  | "READY"
  | "FAILED";

export type KnowledgeDocument = {
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
  organizationId: string;
  documentId: string;
  chunkIndex: number;
  content: string;
  tokenCount: number;
  createdAt: string;
  score: number;
  document: {
    id: string;
    originalName: string;
    fileName: string;
    mimeType: string;
    status: KnowledgeDocumentStatus;
    createdAt: string;
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
    listKnowledgeDocuments: builder.query<ListDocumentsResponse, string>({
      query: (orgId) => `/organizations/${orgId}/kb/documents`,
      providesTags: ["KnowledgeBase"]
    }),

    uploadKnowledgeDocument: builder.mutation<
      UploadDocumentResponse,
      { orgId: string; file: File }
    >({
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

    deleteKnowledgeDocument: builder.mutation<
      { message: string },
      { orgId: string; documentId: string }
    >({
      query: ({ orgId, documentId }) => ({
        url: `/organizations/${orgId}/kb/documents/${documentId}`,
        method: "DELETE"
      }),
      invalidatesTags: ["KnowledgeBase"]
    }),

    reprocessKnowledgeDocument: builder.mutation<
      ReprocessDocumentResponse,
      { orgId: string; documentId: string }
    >({
      query: ({ orgId, documentId }) => ({
        url: `/organizations/${orgId}/kb/documents/${documentId}/process`,
        method: "POST"
      }),
      invalidatesTags: ["KnowledgeBase"]
    }),

    searchKnowledgeBase: builder.query<
      SearchKnowledgeResponse,
      { orgId: string; q: string; limit?: number }
    >({
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

export const {
  useListKnowledgeDocumentsQuery,
  useUploadKnowledgeDocumentMutation,
  useDeleteKnowledgeDocumentMutation,
  useReprocessKnowledgeDocumentMutation,
  useSearchKnowledgeBaseQuery
} = kbApi;