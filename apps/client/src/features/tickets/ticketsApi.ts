import { api } from "../../app/api";

export type TicketStatus =
  | "OPEN"
  | "IN_PROGRESS"
  | "WAITING"
  | "RESOLVED"
  | "CLOSED";

export type TicketPriority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";

export type UserSummary = {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
};

export type TicketListItem = {
  id: string;
  organizationId: string;
  customerId: string;
  assigneeId: string | null;
  title: string;
  description: string;
  status: TicketStatus;
  priority: TicketPriority;
  firstResponseAt: string | null;
  resolvedAt: string | null;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
  customer: UserSummary;
  assignee: UserSummary | null;
  _count: {
    messages: number;
    internalNotes: number;
  };
};

export type TicketPagination = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

export type ListTicketsResponse = {
  data: {
    tickets: TicketListItem[];
    pagination: TicketPagination;
  };
};

export type ListTicketsParams = {
  orgId: string;
  page?: number;
  limit?: number;
  status?: TicketStatus | "";
  priority?: TicketPriority | "";
  search?: string;
  sort?: string;
};

function buildQueryString(params: Omit<ListTicketsParams, "orgId">) {
  const searchParams = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      searchParams.set(key, String(value));
    }
  });

  return searchParams.toString();
}

export const ticketsApi = api.injectEndpoints({
  endpoints: (builder) => ({
    listTickets: builder.query<ListTicketsResponse, ListTicketsParams>({
      query: ({ orgId, ...params }) => {
        const queryString = buildQueryString(params);

        return `/organizations/${orgId}/tickets${queryString ? `?${queryString}` : ""}`;
      },
      providesTags: ["Tickets"]
    })
  })
});

export const { useListTicketsQuery } = ticketsApi;