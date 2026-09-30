import { qualityOverview, listIssues, sourceHealth } from "../knowledge-issues/quality.service.js";
import { prisma } from "../../config/prisma.js";
import { AppError } from "../../common/errors/AppError.js";
import { assertOrgMember } from "../organizations/org.service.js";

type Role = "OWNER" | "ADMIN" | "AGENT" | "CUSTOMER";

const ticketStatuses = [
  "OPEN",
  "IN_PROGRESS",
  "WAITING",
  "RESOLVED",
  "CLOSED"
] as const;

const ticketPriorities = ["LOW", "MEDIUM", "HIGH", "URGENT"] as const;

function assertStaffRole(role: Role) {
  if (role === "CUSTOMER") {
    throw new AppError("Customers cannot view organization analytics", 403);
  }
}

export async function getOrganizationDashboard(userId: string, orgId: string, range:unknown={}) {
  const membership = await assertOrgMember(userId, orgId);
  const role = membership.role as Role;

  assertStaffRole(role);

  const [
    totalTickets,
    unassignedTickets,
    statusCounts,
    priorityCounts,
    firstResponseAverage,
    recentTickets,
    recentActivity
  ] = await Promise.all([
    prisma.ticket.count({
      where: {
        organizationId: orgId
      }
    }),

    prisma.ticket.count({
      where: {
        organizationId: orgId,
        assigneeId: null
      }
    }),

    Promise.all(
      ticketStatuses.map(async (status) => ({
        status,
        count: await prisma.ticket.count({
          where: {
            organizationId: orgId,
            status
          }
        })
      }))
    ),

    Promise.all(
      ticketPriorities.map(async (priority) => ({
        priority,
        count: await prisma.ticket.count({
          where: {
            organizationId: orgId,
            priority
          }
        })
      }))
    ),

    prisma.$queryRaw<Array<{ minutes: number | null }>>`SELECT round(avg(EXTRACT(EPOCH FROM ("firstResponseAt" - "createdAt")) / 60))::float8 AS minutes FROM "Ticket" WHERE "organizationId"=${orgId} AND "firstResponseAt" IS NOT NULL`,

    prisma.ticket.findMany({
      where: {
        organizationId: orgId
      },
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            email: true,
            avatarUrl: true
          }
        },
        assignee: {
          select: {
            id: true,
            name: true,
            email: true,
            avatarUrl: true
          }
        }
      },
      orderBy: {
        updatedAt: "desc"
      },
      take: 5
    }),

    prisma.activityLog.findMany({
      where: {
        organizationId: orgId
      },
      include: {
        actor: {
          select: {
            id: true,
            name: true,
            email: true,
            avatarUrl: true
          }
        },
        ticket: {
          select: {
            id: true,
            title: true,
            status: true,
            priority: true
          }
        }
      },
      orderBy: {
        createdAt: "desc"
      },
      take: 10
    })
  ]);

  const statusSummary = Object.fromEntries(
    statusCounts.map((item) => [item.status, item.count])
  );

  const prioritySummary = Object.fromEntries(
    priorityCounts.map((item) => [item.priority, item.count])
  );
  const [overview,issues,sources]=await Promise.all([qualityOverview(userId,orgId,range),listIssues(userId,orgId,{status:"DETECTED"}),sourceHealth(userId,orgId,range)]);
  const aiQuality={...overview,knowledgeGaps:issues.issues.slice(0,5).map(i=>({topic:i.title,signals:i.signalCount})),sourceQuality:sources.sources.slice(0,5).map(s=>({documentId:s.versionId,documentName:s.documentName+' · v'+s.versionNumber,acceptedUses:s.acceptedRuns,problematicUses:s.knowledgeFailureRuns}))};
  return {
    summary: {
      totalTickets,
      unassignedTickets,
      averageFirstResponseMinutes:
        firstResponseAverage[0]?.minutes ?? null
    },
    statusCounts: statusSummary,
    priorityCounts: prioritySummary,
    recentTickets,
    recentActivity,
    aiQuality
  };
}