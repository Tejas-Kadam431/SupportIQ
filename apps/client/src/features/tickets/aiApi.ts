import { api } from "../../app/api";
import type { TicketPriority, TicketStatus } from "./ticketsApi";

export type AiDraftSource = {
  chunkId: string;
  documentId: string;
  documentName: string;
  chunkIndex: number;
  score: number;
  content: string;
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
    sources: AiDraftSource[];
    ticket: AiDraftTicketSummary;
  };
};

export const aiApi = api.injectEndpoints({
  endpoints: (builder) => ({
    generateAiDraft: builder.mutation<GenerateAiDraftResponse, string>({
      query: (ticketId) => ({
        url: `/tickets/${ticketId}/ai-draft`,
        method: "POST"
      }),
      invalidatesTags: (_result, _error, ticketId) => [
        "AiDrafts",
        { type: "Tickets", id: ticketId }
      ]
    })
  })
});

export const { useGenerateAiDraftMutation } = aiApi;