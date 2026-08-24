import {
  useEffect,
  useMemo,
  useState
} from "react";
import { Link } from "react-router-dom";

import { useAppSelector } from "../app/hooks";

import { useListOrganizationsQuery } from "../features/organizations/orgApi";

import {
  type AiQualityData,
  useGetOrganizationDashboardQuery
} from "../features/dashboard/dashboardApi";

import type {
  TicketPriority,
  TicketStatus
} from "../features/tickets/ticketsApi";

import "./dashboard.css";

const statuses: TicketStatus[] = [
  "OPEN",
  "IN_PROGRESS",
  "WAITING",
  "RESOLVED",
  "CLOSED"
];

const priorities: TicketPriority[] = [
  "LOW",
  "MEDIUM",
  "HIGH",
  "URGENT"
];

type DistributionTone =
  | "blue"
  | "green"
  | "orange"
  | "red"
  | "purple"
  | "slate";

type DistributionItem = {
  label: string;
  value: number;
  tone: DistributionTone;
};

const EMPTY_AI_QUALITY: AiQualityData = {
  totalRuns: 0,
  evaluatedRuns: 0,

  accepted: 0,
  edited: 0,
  rejected: 0,

  acceptanceRate: 0,
  abstentionRate: 0,

  failureReasons: {},

  knowledgeGaps: [],

  sourceQuality: []
};

export function DashboardPage() {
  const user = useAppSelector(
    (state) => state.auth.user
  );

  const [
    selectedOrgId,
    setSelectedOrgId
  ] = useState("");

  const {
    data: orgData,
    isLoading: isLoadingOrganizations,
    isError: isOrganizationsError
  } = useListOrganizationsQuery();

  const organizations =
    orgData?.data.organizations ?? [];

  const selectedOrg =
    organizations.find(
      (item) =>
        item.organization.id ===
        selectedOrgId
    );

  useEffect(() => {
    if (
      !selectedOrgId &&
      organizations.length > 0
    ) {
      setSelectedOrgId(
        organizations[0].organization.id
      );
    }
  }, [
    organizations,
    selectedOrgId
  ]);

  const {
    data: dashboardData,
    isLoading: isLoadingDashboard,
    isError: isDashboardError
  } =
    useGetOrganizationDashboardQuery(
      selectedOrgId,
      {
        skip: !selectedOrgId
      }
    );

  const dashboard =
    dashboardData?.data;

  const aiQuality: AiQualityData =
    dashboard?.aiQuality ??
    EMPTY_AI_QUALITY;

  const activeTickets =
    useMemo(() => {
      if (!dashboard) {
        return 0;
      }

      return (
        (dashboard.statusCounts.OPEN ??
          0) +
        (dashboard.statusCounts
          .IN_PROGRESS ?? 0) +
        (dashboard.statusCounts
          .WAITING ?? 0)
      );
    }, [dashboard]);

  const resolvedTickets =
    dashboard?.statusCounts.RESOLVED ??
    0;

  const copilotOutcomeItems: DistributionItem[] =
    [
      {
        label: "Accepted",
        value: aiQuality.accepted,
        tone: "green"
      },
      {
        label: "Edited",
        value: aiQuality.edited,
        tone: "orange"
      },
      {
        label: "Rejected",
        value: aiQuality.rejected,
        tone: "red"
      }
    ];

  const aiFailureItems: DistributionItem[] =
    Object.entries(
      aiQuality.failureReasons
    ).map(
      ([reason, count]): DistributionItem => ({
        label: formatLabel(reason),
        value: count,
        tone: "red"
      })
    );

  return (
    <div className="app-page dashboard-page">
      {/* PAGE HEADER */}

      <header className="siq-page-header">
        <div className="siq-page-title">
          <p className="dashboard-eyebrow">
            Welcome back,{" "}
            {user?.name ?? "there"}
          </p>

          <h1>
            Customer Support Dashboard
          </h1>

          <p>
            Monitor tickets, response
            performance, support
            activity, and AI-assisted
            workflows.
          </p>
        </div>

        {organizations.length > 0 && (
          <div className="dashboard-org-picker">
            <label htmlFor="organization">
              Organization
            </label>

            <select
              id="organization"
              value={selectedOrgId}
              onChange={(event) =>
                setSelectedOrgId(
                  event.target.value
                )
              }
              disabled={
                isLoadingOrganizations
              }
            >
              {organizations.map(
                (item) => (
                  <option
                    key={
                      item.organization.id
                    }
                    value={
                      item.organization.id
                    }
                  >
                    {
                      item.organization
                        .name
                    }{" "}
                    ({item.role})
                  </option>
                )
              )}
            </select>
          </div>
        )}
      </header>

      {/* ORGANIZATION ERROR */}

      {isOrganizationsError && (
        <section className="siq-card siq-card-padding dashboard-alert dashboard-alert-error">
          Failed to load organizations.
        </section>
      )}

      {/* NO ORGANIZATION */}

      {!isLoadingOrganizations &&
        organizations.length === 0 && (
          <section className="siq-card dashboard-empty-state">
            <div className="dashboard-empty-icon">
              ▦
            </div>

            <h2>
              No organization yet
            </h2>

            <p>
              Create your first
              workspace to start
              managing tickets,
              members, knowledge-base
              documents, AI Copilot
              workflows, and
              analytics.
            </p>

            <Link
              className="siq-button siq-button-primary"
              to="/organizations"
            >
              Create organization
            </Link>
          </section>
        )}

      {/* DASHBOARD LOADING */}

      {selectedOrgId &&
        isLoadingDashboard && (
          <section className="siq-card siq-card-padding dashboard-loading">
            Loading dashboard...
          </section>
        )}

      {/* DASHBOARD ERROR */}

      {selectedOrgId &&
        isDashboardError && (
          <section className="siq-card siq-card-padding dashboard-alert dashboard-alert-error">
            Failed to load dashboard.
            You may need owner, admin,
            or agent access.
          </section>
        )}

      {/* DASHBOARD CONTENT */}

      {dashboard && (
        <>
          {/* MAIN METRICS */}

          <section className="dashboard-metrics">
            <MetricCard
              title="Total Tickets"
              value={
                dashboard.summary
                  .totalTickets
              }
              hint={`${
                selectedOrg
                  ?.organization.name ??
                "Organization"
              } workspace`}
              icon="🎫"
              tone="blue"
            />

            <MetricCard
              title="Active Tickets"
              value={activeTickets}
              hint="Open, in progress, or waiting"
              icon="⚡"
              tone="orange"
            />

            <MetricCard
              title="Resolved"
              value={resolvedTickets}
              hint="Completed support requests"
              icon="✓"
              tone="green"
            />

            <MetricCard
              title="Unassigned"
              value={
                dashboard.summary
                  .unassignedTickets
              }
              hint="Tickets needing ownership"
              icon="👥"
              tone="purple"
            />

            <MetricCard
              title="Avg First Response"
              value={
                dashboard.summary
                  .averageFirstResponseMinutes ===
                null
                  ? "N/A"
                  : `${dashboard.summary.averageFirstResponseMinutes}m`
              }
              hint="First staff reply time"
              icon="⏱"
              tone="blue"
            />
          </section>

          {/* AI QUALITY */}

          <section className="dashboard-bottom-grid">
            <div className="dashboard-compact-distributions">
              <DistributionCard
                title="Copilot Outcomes"
                items={
                  copilotOutcomeItems
                }
              />

              <DistributionCard
                title="AI Failure Reasons"
                items={aiFailureItems}
              />
            </div>

            <section className="siq-card siq-card-padding dashboard-activity-card">
              <div className="siq-card-header">
                <div>
                  <h2 className="siq-card-title">
                    AI Quality Loop
                  </h2>

                  <p className="dashboard-card-subtitle">
                    Agent feedback is
                    converted into
                    actionable AI and
                    knowledge-base quality
                    signals.
                  </p>
                </div>

                <span className="siq-badge siq-badge-purple">
                  {aiQuality.totalRuns}{" "}
                  Copilot runs
                </span>
              </div>

              {/* QUALITY METRICS */}

              <div className="dashboard-ai-preview">
                <strong>
                  Acceptance rate:{" "}
                  {
                    aiQuality.acceptanceRate
                  }
                  %
                </strong>

                <span>
                  {
                    aiQuality.evaluatedRuns
                  }{" "}
                  evaluated runs
                </span>
              </div>

              <div className="dashboard-ai-preview">
                <strong>
                  Abstention rate:{" "}
                  {
                    aiQuality.abstentionRate
                  }
                  %
                </strong>

                <span>
                  Copilot abstains when
                  verified evidence is
                  insufficient.
                </span>
              </div>

              {/* KNOWLEDGE GAPS */}

              <div className="siq-card-header">
                <div>
                  <h3 className="siq-card-title">
                    Knowledge-gap signals
                  </h3>

                  <p className="dashboard-card-subtitle">
                    Topics associated
                    with weak evidence or
                    problematic Copilot
                    outcomes.
                  </p>
                </div>
              </div>

              {aiQuality.knowledgeGaps
                .length === 0 ? (
                <EmptyBlock
                  title="No knowledge gaps detected yet"
                  text="Low-confidence, abstained, and rejected Copilot runs will surface here."
                />
              ) : (
                <div className="dashboard-activity-list">
                  {aiQuality.knowledgeGaps.map(
                    (gap) => (
                      <article
                        key={gap.topic}
                        className="dashboard-activity-item"
                      >
                        <div className="dashboard-activity-dot" />

                        <div>
                          <strong>
                            {gap.topic}
                          </strong>

                          <p>
                            {gap.signals}{" "}
                            knowledge-quality{" "}
                            {gap.signals ===
                            1
                              ? "signal"
                              : "signals"}
                          </p>
                        </div>
                      </article>
                    )
                  )}
                </div>
              )}

              {/* SOURCE QUALITY */}

              <div className="siq-card-header">
                <div>
                  <h3 className="siq-card-title">
                    Knowledge-base source
                    quality
                  </h3>

                  <p className="dashboard-card-subtitle">
                    Sources associated
                    with accepted versus
                    edited or rejected
                    Copilot responses.
                  </p>
                </div>
              </div>

              {aiQuality.sourceQuality
                .length === 0 ? (
                <EmptyBlock
                  title="No source-quality data yet"
                  text="Source performance will appear as agents evaluate Copilot runs."
                />
              ) : (
                <div className="dashboard-activity-list">
                  {aiQuality.sourceQuality.map(
                    (source) => (
                      <article
                        key={
                          source.documentId
                        }
                        className="dashboard-activity-item"
                      >
                        <div className="dashboard-activity-dot" />

                        <div>
                          <strong>
                            {
                              source.documentName
                            }
                          </strong>

                          <p>
                            {
                              source.acceptedUses
                            }{" "}
                            accepted ·{" "}
                            {
                              source.problematicUses
                            }{" "}
                            problematic
                          </p>
                        </div>
                      </article>
                    )
                  )}
                </div>
              )}
            </section>
          </section>

          {/* RECENT TICKETS */}

          <section className="dashboard-main-grid">
            <section className="siq-card dashboard-recent-tickets">
              <div className="siq-card-header">
                <div>
                  <h2 className="siq-card-title">
                    Recent Tickets
                  </h2>

                  <p className="dashboard-card-subtitle">
                    Latest customer
                    issues across this
                    organization.
                  </p>
                </div>

                <Link
                  to="/tickets"
                  className="dashboard-card-link"
                >
                  View all
                </Link>
              </div>

              {dashboard.recentTickets
                .length === 0 ? (
                <EmptyBlock
                  title="No tickets yet"
                  text="Create your first support ticket to see activity here."
                />
              ) : (
                <div className="dashboard-ticket-table">
                  <div className="dashboard-ticket-row dashboard-ticket-head">
                    <span>
                      Subject
                    </span>

                    <span>
                      Customer
                    </span>

                    <span>
                      Status
                    </span>

                    <span>
                      Priority
                    </span>

                    <span>
                      Updated
                    </span>
                  </div>

                  {dashboard.recentTickets.map(
                    (ticket) => (
                      <Link
                        key={ticket.id}
                        to={`/tickets/${ticket.id}`}
                        className="dashboard-ticket-row dashboard-ticket-item"
                      >
                        <span>
                          <strong>
                            {ticket.title}
                          </strong>

                          <small>
                            #
                            {ticket.id.slice(
                              0,
                              8
                            )}
                          </small>
                        </span>

                        <span>
                          {
                            ticket.customer
                              .name
                          }
                        </span>

                        <span>
                          <StatusBadge
                            status={
                              ticket.status
                            }
                          />
                        </span>

                        <span>
                          <PriorityBadge
                            priority={
                              ticket.priority
                            }
                          />
                        </span>

                        <span>
                          {formatDate(
                            ticket.updatedAt
                          )}
                        </span>
                      </Link>
                    )
                  )}
                </div>
              )}
            </section>

            {/* SIDE CARDS */}

            <aside className="dashboard-side-column">
              <section className="siq-card siq-card-padding dashboard-ai-card">
                <div className="dashboard-ai-icon">
                  ✦
                </div>

                <h2>
                  AI Support Copilot
                </h2>

                <p>
                  Analyze tickets,
                  retrieve supporting
                  knowledge, recommend
                  the next action, and
                  generate grounded
                  customer responses.
                </p>

                <div className="dashboard-ai-preview">
                  <strong>
                    Human-in-the-loop AI
                  </strong>

                  <span>
                    Agent acceptance,
                    edits, and rejections
                    feed back into AI
                    quality analytics.
                  </span>
                </div>

                <Link
                  to="/tickets"
                  className="siq-button siq-button-primary"
                >
                  Open Tickets
                </Link>
              </section>

              <section className="siq-card siq-card-padding dashboard-kb-card">
                <div className="siq-card-header">
                  <h2 className="siq-card-title">
                    Knowledge Base
                  </h2>

                  <Link
                    to="/knowledge-base"
                    className="dashboard-card-link"
                  >
                    Manage
                  </Link>
                </div>

                <p>
                  Upload documents,
                  process chunks in
                  background jobs, and
                  retrieve relevant
                  evidence for Copilot.
                </p>

                <div className="dashboard-kb-steps">
                  <span>
                    Upload
                  </span>

                  <span>
                    Chunk
                  </span>

                  <span>
                    Retrieve
                  </span>

                  <span>
                    Copilot
                  </span>
                </div>
              </section>
            </aside>
          </section>

          {/* DISTRIBUTIONS + ACTIVITY */}

          <section className="dashboard-bottom-grid">
            <div className="dashboard-compact-distributions">
              <DistributionCard
                title="Tickets by Status"
                items={statuses.map(
                  (
                    status
                  ): DistributionItem => ({
                    label:
                      formatLabel(
                        status
                      ),

                    value:
                      dashboard
                        .statusCounts[
                        status
                      ] ?? 0,

                    tone:
                      statusTone(
                        status
                      )
                  })
                )}
              />

              <DistributionCard
                title="Tickets by Priority"
                items={priorities.map(
                  (
                    priority
                  ): DistributionItem => ({
                    label:
                      formatLabel(
                        priority
                      ),

                    value:
                      dashboard
                        .priorityCounts[
                        priority
                      ] ?? 0,

                    tone:
                      priorityTone(
                        priority
                      )
                  })
                )}
              />
            </div>

            <section className="siq-card siq-card-padding dashboard-activity-card">
              <div className="siq-card-header">
                <div>
                  <h2 className="siq-card-title">
                    Recent Activity
                  </h2>

                  <p className="dashboard-card-subtitle">
                    Latest audit events
                    and support actions.
                  </p>
                </div>
              </div>

              {dashboard.recentActivity
                .length === 0 ? (
                <EmptyBlock
                  title="No activity yet"
                  text="Activity will appear here."
                />
              ) : (
                <div className="dashboard-activity-list">
                  {dashboard.recentActivity.map(
                    (activity) => (
                      <article
                        key={
                          activity.id
                        }
                        className="dashboard-activity-item"
                      >
                        <div className="dashboard-activity-dot" />

                        <div>
                          <strong>
                            {
                              activity.message
                            }
                          </strong>

                          <p>
                            {activity.actor
                              ? `${activity.actor.name} · ${activity.actor.email}`
                              : "System"}
                          </p>

                          <small>
                            {formatDate(
                              activity.createdAt
                            )}
                          </small>
                        </div>
                      </article>
                    )
                  )}
                </div>
              )}
            </section>
          </section>
        </>
      )}
    </div>
  );
}

type MetricCardProps = {
  title: string;

  value:
    | string
    | number;

  hint: string;

  icon: string;

  tone:
    | "blue"
    | "green"
    | "orange"
    | "purple";
};

function MetricCard({
  title,
  value,
  hint,
  icon,
  tone
}: MetricCardProps) {
  return (
    <article className="siq-card dashboard-metric-card">
      <div
        className={`dashboard-metric-icon dashboard-metric-icon-${tone}`}
      >
        {icon}
      </div>

      <div>
        <p>
          {title}
        </p>

        <strong>
          {value}
        </strong>

        <small>
          {hint}
        </small>
      </div>
    </article>
  );
}

type DistributionCardProps = {
  title: string;

  items: DistributionItem[];
};

function DistributionCard({
  title,
  items
}: DistributionCardProps) {
  const total =
    items.reduce(
      (sum, item) =>
        sum + item.value,
      0
    );

  return (
    <section className="siq-card siq-card-padding dashboard-distribution-card">
      <div className="siq-card-header">
        <h2 className="siq-card-title">
          {title}
        </h2>

        <span className="siq-badge">
          {total} total
        </span>
      </div>

      {items.length === 0 ? (
        <EmptyBlock
          title="No data yet"
          text="Data will appear after more activity is recorded."
        />
      ) : (
        <div className="dashboard-distribution-list">
          {items.map(
            (item: DistributionItem) => {
              const percentage =
                total === 0
                  ? 0
                  : Math.round(
                      (item.value /
                        total) *
                        100
                    );

              return (
                <div
                  key={item.label}
                  className="dashboard-distribution-item"
                >
                  <div className="dashboard-distribution-meta">
                    <span>
                      {item.label}
                    </span>

                    <strong>
                      {item.value}{" "}
                      <small>
                        ({percentage}%)
                      </small>
                    </strong>
                  </div>

                  <div className="dashboard-progress-track">
                    <div
                      className={`dashboard-progress-fill dashboard-progress-${item.tone}`}
                      style={{
                        width: `${percentage}%`
                      }}
                    />
                  </div>
                </div>
              );
            }
          )}
        </div>
      )}
    </section>
  );
}

function EmptyBlock({
  title,
  text
}: {
  title: string;
  text: string;
}) {
  return (
    <div className="dashboard-empty-block">
      <strong>
        {title}
      </strong>

      <p>
        {text}
      </p>
    </div>
  );
}

function StatusBadge({
  status
}: {
  status: TicketStatus;
}) {
  return (
    <span
      className={`siq-badge siq-badge-${statusTone(
        status
      )}`}
    >
      {formatLabel(status)}
    </span>
  );
}

function PriorityBadge({
  priority
}: {
  priority: TicketPriority;
}) {
  return (
    <span
      className={`siq-badge siq-badge-${priorityTone(
        priority
      )}`}
    >
      {formatLabel(priority)}
    </span>
  );
}

function formatLabel(
  value: string
) {
  return value
    .toLowerCase()
    .split("_")
    .map(
      (part) =>
        part[0].toUpperCase() +
        part.slice(1)
    )
    .join(" ");
}

function formatDate(
  value: string
) {
  return new Date(
    value
  ).toLocaleString(
    undefined,
    {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    }
  );
}

function statusTone(
  status: TicketStatus
): DistributionTone {
  if (status === "OPEN") {
    return "blue";
  }

  if (
    status === "IN_PROGRESS"
  ) {
    return "purple";
  }

  if (status === "WAITING") {
    return "orange";
  }

  if (status === "RESOLVED") {
    return "green";
  }

  return "slate";
}

function priorityTone(
  priority: TicketPriority
): DistributionTone {
  if (priority === "LOW") {
    return "green";
  }

  if (
    priority === "MEDIUM"
  ) {
    return "orange";
  }

  if (
    priority === "HIGH" ||
    priority === "URGENT"
  ) {
    return "red";
  }

  return "slate";
}