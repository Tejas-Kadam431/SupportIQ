import { api } from "../../app/api";
import type { UserSummary } from "./ticketsApi";

export type ActivityType =
  | "TICKET_CREATED"
  | "TICKET_ASSIGNED"
  | "STATUS_CHANGED"
  | "MESSAGE_SENT"
  | "INTERNAL_NOTE_ADDED"
  | "AI_REPLY_GENERATED"
  | "DOCUMENT_UPLOADED";

export type ActivityLogItem = {
  id: string;
  organizationId: string;
  ticketId: string | null;
  actorId: string | null;
  type: ActivityType;
  message: string;
  metadata: unknown;
  createdAt: string;
  actor: UserSummary | null;
};

export type ListActivityResponse = {
  data: {
    activities: ActivityLogItem[];
  };
};

export const activityApi = api.injectEndpoints({
  endpoints: (builder) => ({
    listTicketActivity: builder.query<ListActivityResponse, string>({
      query: (ticketId) => `/tickets/${ticketId}/activity`,
      providesTags: (_result, _error, ticketId) => [
        "Activity",
        { type: "Activity", id: ticketId }
      ]
    })
  })
});

export const { useListTicketActivityQuery } = activityApi;