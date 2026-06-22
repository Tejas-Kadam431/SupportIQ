import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAppSelector } from "../app/hooks";
import { useListOrganizationsQuery } from "../features/organizations/orgApi";
import { useGetOrganizationDashboardQuery } from "../features/dashboard/dashboardApi";
import type { TicketPriority, TicketStatus } from "../features/tickets/ticketsApi";

const statuses: TicketStatus[] = [
  "OPEN",
  "IN_PROGRESS",
  "WAITING",
  "RESOLVED",
  "CLOSED"
];

const priorities: TicketPriority[] = ["LOW", "MEDIUM", "HIGH", "URGENT"];

export function DashboardPage() {
  const user = useAppSelector((state) => state.auth.user);
  const [selectedOrgId, setSelectedOrgId] = useState("");

  const {
    data: orgData,
    isLoading: isLoadingOrganizations,
    isError: isOrganizationsError
  } = useListOrganizationsQuery();

  const organizations = orgData?.data.organizations ?? [];

  useEffect(() => {
    if (!selectedOrgId && organizations.length > 0) {
      setSelectedOrgId(organizations[0].organization.id);
    }
  }, [organizations, selectedOrgId]);

  const {
    data: dashboardData,
    isLoading: isLoadingDashboard,
    isError: isDashboardError
  } = useGetOrganizationDashboardQuery(selectedOrgId, {
    skip: !selectedOrgId
  });

  const dashboard = dashboardData?.data;

  return (
    <main style={{ padding: "2rem", fontFamily: "system-ui" }}>
      <header style={{ marginBottom: "2rem" }}>
        <h1>SupportIQ Dashboard</h1>
        <p>Welcome, {user?.name ?? "there"}.</p>

        <nav style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
          <Link to="/organizations">Organizations</Link>
          <Link to="/tickets">Tickets</Link>
          <Link to="/tickets/new">Create Ticket</Link>
          <Link to="/knowledge-base">Knowledge Base</Link>
        </nav>
      </header>

      <section style={{ marginBottom: "1.5rem" }}>
        <label>
          Organization
          <select
            value={selectedOrgId}
            onChange={(event) => setSelectedOrgId(event.target.value)}
            disabled={isLoadingOrganizations}
            style={{
              display: "block",
              padding: "0.7rem",
              marginTop: "0.5rem",
              minWidth: 280
            }}
          >
            {organizations.map((item) => (
              <option key={item.organization.id} value={item.organization.id}>
                {item.organization.name} ({item.role})
              </option>
            ))}
          </select>
        </label>

        {isOrganizationsError && (
          <p style={{ color: "red" }}>Failed to load organizations.</p>
        )}
      </section>

      {!isLoadingOrganizations && organizations.length === 0 && (
        <section>
          <p>No organization found. Create one to view analytics.</p>
          <Link to="/organizations">Create organization</Link>
        </section>
      )}

      {selectedOrgId && isLoadingDashboard && <p>Loading dashboard...</p>}

      {selectedOrgId && isDashboardError && (
        <p style={{ color: "red" }}>
          Failed to load dashboard. You may need owner, admin, or agent access.
        </p>
      )}

      {dashboard && (
        <>
          <section
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
              gap: "1rem",
              marginBottom: "1.5rem"
            }}
          >
            <MetricCard
              title="Total Tickets"
              value={dashboard.summary.totalTickets}
            />
            <MetricCard
              title="Open Tickets"
              value={dashboard.statusCounts.OPEN}
            />
            <MetricCard
              title="Unassigned"
              value={dashboard.summary.unassignedTickets}
            />
            <MetricCard
              title="Avg First Response"
              value={
                dashboard.summary.averageFirstResponseMinutes === null
                  ? "N/A"
                  : `${dashboard.summary.averageFirstResponseMinutes} min`
              }
            />
          </section>

          <section
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "1rem",
              marginBottom: "1.5rem"
            }}
          >
            <DistributionCard
              title="Tickets by Status"
              items={statuses.map((status) => ({
                label: status,
                value: dashboard.statusCounts[status] ?? 0
              }))}
            />

            <DistributionCard
              title="Tickets by Priority"
              items={priorities.map((priority) => ({
                label: priority,
                value: dashboard.priorityCounts[priority] ?? 0
              }))}
            />
          </section>

          <section
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "1rem"
            }}
          >
            <section
              style={{
                border: "1px solid #ddd",
                borderRadius: 8,
                padding: "1rem"
              }}
            >
              <h2>Recent Tickets</h2>

              {dashboard.recentTickets.length === 0 && <p>No tickets yet.</p>}

              <div style={{ display: "grid", gap: "0.75rem" }}>
                {dashboard.recentTickets.map((ticket) => (
                  <article
                    key={ticket.id}
                    style={{
                      border: "1px solid #eee",
                      borderRadius: 8,
                      padding: "0.75rem"
                    }}
                  >
                    <Link to={`/tickets/${ticket.id}`}>
                      <strong>{ticket.title}</strong>
                    </Link>

                    <p style={{ marginBottom: "0.25rem" }}>
                      {ticket.status} · {ticket.priority}
                    </p>

                    <small>
                      Customer: {ticket.customer.name} · Updated{" "}
                      {new Date(ticket.updatedAt).toLocaleString()}
                    </small>
                  </article>
                ))}
              </div>
            </section>

            <section
              style={{
                border: "1px solid #ddd",
                borderRadius: 8,
                padding: "1rem"
              }}
            >
              <h2>Recent Activity</h2>

              {dashboard.recentActivity.length === 0 && <p>No activity yet.</p>}

              <div style={{ display: "grid", gap: "0.75rem" }}>
                {dashboard.recentActivity.map((activity) => (
                  <article
                    key={activity.id}
                    style={{
                      border: "1px solid #eee",
                      borderRadius: 8,
                      padding: "0.75rem"
                    }}
                  >
                    <strong>{activity.message}</strong>

                    <p style={{ marginBottom: "0.25rem" }}>
                      {activity.actor
                        ? `${activity.actor.name} (${activity.actor.email})`
                        : "System"}
                    </p>

                    <small>{new Date(activity.createdAt).toLocaleString()}</small>
                  </article>
                ))}
              </div>
            </section>
          </section>
        </>
      )}
    </main>
  );
}

type MetricCardProps = {
  title: string;
  value: string | number;
};

function MetricCard({ title, value }: MetricCardProps) {
  return (
    <article
      style={{
        border: "1px solid #ddd",
        borderRadius: 8,
        padding: "1rem"
      }}
    >
      <strong>{title}</strong>
      <p style={{ fontSize: "2rem", margin: "0.5rem 0 0" }}>{value}</p>
    </article>
  );
}

type DistributionCardProps = {
  title: string;
  items: {
    label: string;
    value: number;
  }[];
};

function DistributionCard({ title, items }: DistributionCardProps) {
  const total = items.reduce((sum, item) => sum + item.value, 0);

  return (
    <section
      style={{
        border: "1px solid #ddd",
        borderRadius: 8,
        padding: "1rem"
      }}
    >
      <h2>{title}</h2>

      <div style={{ display: "grid", gap: "0.75rem" }}>
        {items.map((item) => {
          const percentage = total === 0 ? 0 : Math.round((item.value / total) * 100);

          return (
            <div key={item.label}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  marginBottom: "0.25rem"
                }}
              >
                <span>{item.label}</span>
                <span>
                  {item.value} ({percentage}%)
                </span>
              </div>

              <div
                style={{
                  height: 8,
                  background: "#eee",
                  borderRadius: 999,
                  overflow: "hidden"
                }}
              >
                <div
                  style={{
                    width: `${percentage}%`,
                    height: "100%",
                    background: "#333"
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}