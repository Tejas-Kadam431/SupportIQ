import { api } from "../../app/api";
import type {
  TicketPriority,
  TicketStatus,
  UserSummary
} from "../tickets/ticketsApi";
import type { ActivityType } from "../tickets/activityApi";

export type DashboardTicket = {
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
};

export type DashboardActivity = {
  id: string;
  organizationId: string;
  ticketId: string | null;
  actorId: string | null;

  type: ActivityType;
  message: string;
  metadata: unknown;

  createdAt: string;

  actor: UserSummary | null;

  ticket: {
    id: string;
    title: string;
    status: TicketStatus;
    priority: TicketPriority;
  } | null;
};

export type KnowledgeGapSignal = {
  topic: string;
  signals: number;
};

export type SourceQualitySignal = {
  documentId: string;
  documentName: string;
  acceptedUses: number;
  problematicUses: number;
};

export type AiQualityData = {
  totalRuns: number;
  evaluatedRuns: number;

  accepted: number;
  edited: number;
  rejected: number;

  acceptanceRate: number;
  abstentionRate: number;

  failureReasons: Record<string, number>;

  knowledgeGaps: KnowledgeGapSignal[];

  sourceQuality: SourceQualitySignal[];
};

export type DashboardResponse = {
  data: {
    summary: {
      totalTickets: number;
      unassignedTickets: number;
      averageFirstResponseMinutes: number | null;
    };

    statusCounts: Record<TicketStatus, number>;

    priorityCounts: Record<TicketPriority, number>;

    recentTickets: DashboardTicket[];

    recentActivity: DashboardActivity[];

    aiQuality: AiQualityData;
  };
};

export const dashboardApi = api.injectEndpoints({
  endpoints: (builder) => ({
    getOrganizationDashboard: builder.query<
      DashboardResponse,
      string
    >({
      query: (orgId) =>
        `/organizations/${orgId}/dashboard`,

      providesTags: ["Dashboard"]
    })
  })
});

export const {
  useGetOrganizationDashboardQuery
} = dashboardApi;