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

function calculateAverageFirstResponseMinutes(
  tickets: {
    createdAt: Date;
    firstResponseAt: Date | null;
  }[]
) {
  const respondedTickets = tickets.filter((ticket) => ticket.firstResponseAt);

  if (respondedTickets.length === 0) {
    return null;
  }

  const totalMinutes = respondedTickets.reduce((sum, ticket) => {
    const firstResponseAt = ticket.firstResponseAt;

    if (!firstResponseAt) {
      return sum;
    }

    const diffMs = firstResponseAt.getTime() - ticket.createdAt.getTime();
    return sum + diffMs / 1000 / 60;
  }, 0);

  return Math.round(totalMinutes / respondedTickets.length);
}
type AiQualityRun = {
  topic: string;
  abstained: boolean;
  sources: unknown;
  evaluation: {
    disposition: "ACCEPTED" | "EDITED" | "REJECTED";
    reason: string | null;
  } | null;
};

function getSourceSnapshots(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    if (
      !item ||
      typeof item !== "object" ||
      Array.isArray(item)
    ) {
      return [];
    }

    const source = item as Record<string, unknown>;

    if (
      typeof source.documentId !== "string" ||
      typeof source.documentName !== "string"
    ) {
      return [];
    }

    return [
      {
        documentId: source.documentId,
        documentName: source.documentName
      }
    ];
  });
}

function buildAiQuality(runs: AiQualityRun[]) {
  let accepted = 0;
  let edited = 0;
  let rejected = 0;
  let abstained = 0;

  const failureReasons: Record<string, number> = {};

  const gapMap = new Map<
    string,
    {
      topic: string;
      signals: number;
    }
  >();

  const sourceMap = new Map<
    string,
    {
      documentId: string;
      documentName: string;
      acceptedUses: number;
      problematicUses: number;
    }
  >();

  for (const run of runs) {
    if (run.abstained) {
      abstained += 1;
    }

    const disposition = run.evaluation?.disposition;
    const reason = run.evaluation?.reason;

    if (disposition === "ACCEPTED") accepted += 1;
    if (disposition === "EDITED") edited += 1;
    if (disposition === "REJECTED") rejected += 1;

    if (reason) {
      failureReasons[reason] =
        (failureReasons[reason] ?? 0) + 1;
    }

    const isKnowledgeGapSignal =
      run.abstained ||
      reason === "INSUFFICIENT_KB" ||
      reason === "WRONG_KNOWLEDGE" ||
      reason === "IRRELEVANT_EVIDENCE";

    if (isKnowledgeGapSignal) {
      const key = run.topic
        .trim()
        .toLowerCase();

      const existing = gapMap.get(key);

      if (existing) {
        existing.signals += 1;
      } else {
        gapMap.set(key, {
          topic: run.topic,
          signals: 1
        });
      }
    }

    for (const source of getSourceSnapshots(run.sources)) {
      const existing =
        sourceMap.get(source.documentId) ?? {
          ...source,
          acceptedUses: 0,
          problematicUses: 0
        };

      if (disposition === "ACCEPTED") {
        existing.acceptedUses += 1;
      }

      if (
        disposition === "EDITED" ||
        disposition === "REJECTED"
      ) {
        existing.problematicUses += 1;
      }

      sourceMap.set(source.documentId, existing);
    }
  }

  const evaluatedRuns =
    accepted + edited + rejected;

  return {
    totalRuns: runs.length,
    evaluatedRuns,

    accepted,
    edited,
    rejected,

    acceptanceRate:
      evaluatedRuns === 0
        ? 0
        : Math.round(
            (accepted / evaluatedRuns) * 100
          ),

    abstentionRate:
      runs.length === 0
        ? 0
        : Math.round(
            (abstained / runs.length) * 100
          ),

    failureReasons,

    knowledgeGaps: [...gapMap.values()]
      .sort((a, b) => b.signals - a.signals)
      .slice(0, 5),

    sourceQuality: [...sourceMap.values()]
      .sort(
        (a, b) =>
          b.problematicUses -
            a.problematicUses ||
          b.acceptedUses - a.acceptedUses
      )
      .slice(0, 5)
  };
}

export async function getOrganizationDashboard(userId: string, orgId: string) {
  const membership = await assertOrgMember(userId, orgId);
  const role = membership.role as Role;

  assertStaffRole(role);

  const [
    totalTickets,
    unassignedTickets,
    statusCounts,
    priorityCounts,
    firstResponseTickets,
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

    prisma.ticket.findMany({
      where: {
        organizationId: orgId,
        firstResponseAt: {
          not: null
        }
      },
      select: {
        createdAt: true,
        firstResponseAt: true
      }
    }),

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
  const copilotRuns =
    await prisma.copilotRun.findMany({
      where: {
        organizationId: orgId
      },

      select: {
        topic: true,
        abstained: true,
        sources: true,

        evaluation: {
          select: {
            disposition: true,
            reason: true
          }
        }
      }
    });

  const aiQuality = buildAiQuality(copilotRuns);
  return {
    summary: {
      totalTickets,
      unassignedTickets,
      averageFirstResponseMinutes:
        calculateAverageFirstResponseMinutes(firstResponseTickets)
    },
    statusCounts: statusSummary,
    priorityCounts: prioritySummary,
    recentTickets,
    recentActivity,
    aiQuality
  };
}