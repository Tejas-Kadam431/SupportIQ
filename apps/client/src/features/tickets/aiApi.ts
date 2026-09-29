import type { TicketMessage } from "./messagesApi";
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
  | "keyword"
  | "hybrid";

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
  documentVersionId?: string;
  versionNumber?: number;
  publishedAt?: string;
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
    evidenceLevel?: "STRONG" | "LIMITED" | "INSUFFICIENT";
    evidenceDecision?: string;
    evidenceReason?: string;

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
  disposition: "REJECTED";
  reason: CopilotFailureReason;
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

    sendCopilot: builder.mutation<
      { data: { message: TicketMessage; evaluation: { disposition: "ACCEPTED" | "EDITED" }; replayed: boolean } },
      { ticketId: string; runId: string; finalMessage: string }
    >({
      query: ({ ticketId, runId, finalMessage }) => ({
        url: `/tickets/${ticketId}/copilot-runs/${runId}/send`, method: "POST", body: { finalMessage }
      }),
      invalidatesTags: (_result, _error, { ticketId }) => [
        "Dashboard", "Messages", { type: "Messages", id: ticketId }, "Tickets", { type: "Tickets", id: ticketId }
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
  useSendCopilotMutation,
  useEvaluateCopilotMutation
} = aiApi;