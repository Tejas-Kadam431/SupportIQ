import { api } from "../../app/api";
import type { TicketPriority, TicketStatus } from "./ticketsApi";

export type AiDraftTone = "PROFESSIONAL" | "FRIENDLY" | "CONCISE";
export type AiDraftConfidence = "LOW" | "MEDIUM" | "HIGH";
export type AiSearchMode = "semantic" | "keyword";

export type AiDraftSource = {
  chunkId: string;
  documentId: string;
  documentName: string;
  chunkIndex: number;
  score: number;
  citationLabel: string;
  searchType: AiSearchMode;
  excerpt: string;
  content: string;
};

export type AiDraftGrounding = {
  searchQuery: string;
  searchMode: AiSearchMode;
  sourceCount: number;
  hasKnowledgeContext: boolean;
};

export type AiDraftTicketSummary = {
  id: string;
  title: string;
  status: TicketStatus;
  priority: TicketPriority;
};

export type GenerateAiDraftResponse = {
  message: string;
  data: {
    draft: string;
    provider: "openai" | "fallback";
    confidence: AiDraftConfidence;
    warnings: string[];
    tone: AiDraftTone;
    grounding: AiDraftGrounding;
    sources: AiDraftSource[];
    ticket: AiDraftTicketSummary;
  };
};

export type GenerateAiDraftRequest = {
  ticketId: string;
  tone: AiDraftTone;
};

export const aiApi = api.injectEndpoints({
  endpoints: (builder) => ({
    generateAiDraft: builder.mutation<
      GenerateAiDraftResponse,
      GenerateAiDraftRequest
    >({
      query: ({ ticketId, tone }) => ({
        url: `/tickets/${ticketId}/ai-draft`,
        method: "POST",
        body: {
          tone
        }
      }),
      invalidatesTags: (_result, _error, { ticketId }) => [
        "AiDrafts",
        { type: "Tickets", id: ticketId }
      ]
    })
  })
});

export const { useGenerateAiDraftMutation } = aiApi;