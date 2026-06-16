import { api } from "../../app/api";
import type { UserSummary } from "./ticketsApi";

export type InternalNote = {
  id: string;
  ticketId: string;
  authorId: string;
  body: string;
  createdAt: string;
  updatedAt: string;
  author: UserSummary;
};

export type ListNotesResponse = {
  data: {
    notes: InternalNote[];
  };
};

export type CreateNoteResponse = {
  message: string;
  data: {
    note: InternalNote;
  };
};

export const notesApi = api.injectEndpoints({
  endpoints: (builder) => ({
    listNotes: builder.query<ListNotesResponse, string>({
      query: (ticketId) => `/tickets/${ticketId}/notes`,
      providesTags: (_result, _error, ticketId) => [
        "Notes",
        { type: "Notes", id: ticketId }
      ]
    }),

    createNote: builder.mutation<
      CreateNoteResponse,
      { ticketId: string; body: string }
    >({
      query: ({ ticketId, body }) => ({
        url: `/tickets/${ticketId}/notes`,
        method: "POST",
        body: { body }
      }),
      invalidatesTags: (_result, _error, { ticketId }) => [
        "Notes",
        { type: "Notes", id: ticketId },
        "Tickets",
        { type: "Tickets", id: ticketId }
      ]
    })
  })
});

export const { useListNotesQuery, useCreateNoteMutation } = notesApi;