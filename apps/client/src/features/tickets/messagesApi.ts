import { api } from "../../app/api";
import type { UserSummary } from "./ticketsApi";

export type TicketMessage = {
  id: string;
  ticketId: string;
  senderId: string;
  body: string;
  createdAt: string;
  updatedAt: string;
  sender: UserSummary;
};

export type ListMessagesResponse = {
  data: {
    messages: TicketMessage[];
  };
};

export type CreateMessageResponse = {
  message: string;
  data: {
    message: TicketMessage;
  };
};

export const messagesApi = api.injectEndpoints({
  endpoints: (builder) => ({
    listMessages: builder.query<ListMessagesResponse, string>({
      query: (ticketId) => `/tickets/${ticketId}/messages`,
      providesTags: (_result, _error, ticketId) => [
        "Messages",
        { type: "Messages", id: ticketId }
      ]
    }),

    createMessage: builder.mutation<
      CreateMessageResponse,
      { ticketId: string; body: string }
    >({
      query: ({ ticketId, body }) => ({
        url: `/tickets/${ticketId}/messages`,
        method: "POST",
        body: { body }
      }),
      invalidatesTags: (_result, _error, { ticketId }) => [
        "Messages",
        { type: "Messages", id: ticketId },
        "Tickets",
        { type: "Tickets", id: ticketId }
      ]
    })
  })
});

export const { useListMessagesQuery, useCreateMessageMutation } = messagesApi;