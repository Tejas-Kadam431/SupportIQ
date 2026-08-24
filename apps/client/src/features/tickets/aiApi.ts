import { api } from "../../app/api";
import type {
  TicketPriority,
  TicketStatus
} from "./ticketsApi";

export type AiDraftTone =
  | "PROFESSIONAL"
  | "FRIENDLY"
  | "CONCISE";

export type AiDraftConfidence =
  | "LOW"
  | "MEDIUM"
  | "HIGH";

export type AiSearchMode =
  | "semantic"
  | "keyword";

export type AiProvider =
  | "gemini"
  | "openai"
  | "fallback";

export type CopilotDisposition =
  | "ACCEPTED"
  | "EDITED"
  | "REJECTED";

export type CopilotFailureReason =
  | "WRONG_KNOWLEDGE"
  | "MISSING_CUSTOMER_CONTEXT"
  | "INSUFFICIENT_KB"
  | "IRRELEVANT_EVIDENCE"
  | "INCORRECT_RECOMMENDATION"
  | "INCOMPLETE_RESPONSE"
  | "BAD_TONE"
  | "UNSUPPORTED_CLAIM"
  | "OTHER";

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
    runId: string | null;

    topic: string;
    issueSummary: string;
    missingInformation: string[];
    recommendedAction: string;

    suggestedReply: string | null;
    abstained: boolean;

    draft: string;

    provider: AiProvider;
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

type EvaluateCopilotRequest = {
  ticketId: string;
  runId: string;
  disposition: CopilotDisposition;
  reason?: CopilotFailureReason;
  finalMessage?: string;
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

      invalidatesTags: (
        _result,
        _error,
        { ticketId }
      ) => [
        "AiDrafts",
        "Dashboard",
        { type: "Tickets", id: ticketId }
      ]
    }),

    evaluateCopilot: builder.mutation<
      unknown,
      EvaluateCopilotRequest
    >({
      query: ({
        ticketId,
        runId,
        ...body
      }) => ({
        url:
          `/tickets/${ticketId}/copilot-runs/` +
          `${runId}/evaluation`,

        method: "PUT",
        body
      }),

      invalidatesTags: ["Dashboard"]
    })
  })
});

export const {
  useGenerateAiDraftMutation,
  useEvaluateCopilotMutation
} = aiApi;