import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useListOrganizationsQuery } from "../organizations/orgApi";
import {
  type TicketPriority,
  type TicketStatus,
  useListTicketsQuery
} from "./ticketsApi";
import "./tickets.css";

const PAGE_LIMIT = 10;

const statuses: (TicketStatus | "")[] = [
  "",
  "OPEN",
  "IN_PROGRESS",
  "WAITING",
  "RESOLVED",
  "CLOSED"
];

const priorities: (TicketPriority | "")[] = ["", "LOW", "MEDIUM", "HIGH", "URGENT"];

export function TicketsPage() {
  const [selectedOrgId, setSelectedOrgId] = useState("");
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<TicketStatus | "">("");
  const [priority, setPriority] = useState<TicketPriority | "">("");

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
    data: ticketData,
    isLoading: isLoadingTickets,
    isFetching,
    isError: isTicketsError
  } = useListTicketsQuery(
    {
      orgId: selectedOrgId,
      page,
      limit: PAGE_LIMIT,
      search,
      status,
      priority,
      sort: "createdAt:desc"
    },
    {
      skip: !selectedOrgId
    }
  );

  const tickets = ticketData?.data.tickets ?? [];
  const pagination = ticketData?.data.pagination;

  return (
    <main className="app-page ticket-page">
      <header className="ticket-shell-header">
        <div>
          <p className="ticket-eyebrow">Support Queue</p>
          <h1>Tickets</h1>
          <p>Search, filter, assign, and resolve customer support requests.</p>
        </div>

        {organizations.length > 0 && (
          <div className="ticket-toolbar">
            <Link to="/tickets/new" className="siq-button siq-button-primary">
              Create ticket
            </Link>
          </div>
        )}
      </header>

      {isLoadingOrganizations && (
        <section className="siq-card ticket-loading">
          Loading organizations...
        </section>
      )}

      {isOrganizationsError && (
        <section className="siq-card ticket-alert ticket-alert-error">
          Failed to load organizations. Please refresh the page or log in again.
        </section>
      )}

      {!isLoadingOrganizations && !isOrganizationsError && organizations.length === 0 && (
        <section className="siq-card ticket-empty-state">
          <h2>No organization found</h2>
          <p>
            Create an organization first so SupportIQ can group tickets,
            members, knowledge-base documents, and activity under one workspace.
          </p>
          <Link to="/organizations" className="siq-button siq-button-primary">
            Create organization
          </Link>
        </section>
      )}

      {organizations.length > 0 && (
        <>
          <section className="siq-card ticket-filters-card">
            <div className="ticket-shell-header" style={{ marginBottom: "1rem" }}>
              <div>
                <h2 className="siq-card-title">Filters</h2>
                <p className="dashboard-card-subtitle">
                  Narrow the queue by organization, status, priority, or keywords.
                </p>
              </div>
            </div>

            <div className="ticket-filters-grid">
              <div className="ticket-org-select">
                <label htmlFor="ticket-org">Organization</label>
                <select
                  id="ticket-org"
                  value={selectedOrgId}
                  onChange={(event) => {
                    setSelectedOrgId(event.target.value);
                    setPage(1);
                  }}
                  disabled={isLoadingOrganizations}
                >
                  {organizations.map((item) => (
                    <option
                      key={item.organization.id}
                      value={item.organization.id}
                    >
                      {item.organization.name} ({item.role})
                    </option>
                  ))}
                </select>
              </div>

              <div className="ticket-field">
                <label htmlFor="ticket-search">Search</label>
                <input
                  id="ticket-search"
                  value={search}
                  onChange={(event) => {
                    setSearch(event.target.value);
                    setPage(1);
                  }}
                  placeholder="Search title or description..."
                />
              </div>

              <div className="ticket-field">
                <label htmlFor="ticket-status">Status</label>
                <select
                  id="ticket-status"
                  value={status}
                  onChange={(event) => {
                    setStatus(event.target.value as TicketStatus | "");
                    setPage(1);
                  }}
                >
                  {statuses.map((item) => (
                    <option key={item || "ALL"} value={item}>
                      {item ? formatLabel(item) : "All statuses"}
                    </option>
                  ))}
                </select>
              </div>

              <div className="ticket-field">
                <label htmlFor="ticket-priority">Priority</label>
                <select
                  id="ticket-priority"
                  value={priority}
                  onChange={(event) => {
                    setPriority(event.target.value as TicketPriority | "");
                    setPage(1);
                  }}
                >
                  {priorities.map((item) => (
                    <option key={item || "ALL"} value={item}>
                      {item ? formatLabel(item) : "All priorities"}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </section>

          {selectedOrgId && (
            <section className="siq-card ticket-list-card">
              <div className="ticket-list-top">
                <div>
                  <h2>Ticket Queue</h2>
                  <p>
                    {pagination
                      ? `${pagination.total} tickets found`
                      : "Tickets matching your filters"}
                  </p>
                </div>

                {isFetching && !isLoadingTickets && (
                  <span className="siq-badge siq-badge-blue">Refreshing</span>
                )}
              </div>

              {isLoadingTickets && (
                <div className="ticket-loading">Loading tickets...</div>
              )}

              {isTicketsError && (
                <div className="ticket-alert ticket-alert-error">
                  Failed to load tickets. Check backend or login session.
                </div>
              )}

              {!isLoadingTickets && tickets.length === 0 && (
                <div className="ticket-empty-state">
                  No tickets found for the selected filters.
                </div>
              )}

              {tickets.length > 0 && (
                <div className="ticket-table">
                  <div className="ticket-table-row ticket-table-head">
                    <span>Subject</span>
                    <span>Customer</span>
                    <span>Assignee</span>
                    <span>Status</span>
                    <span>Priority</span>
                    <span>Created</span>
                  </div>

                  {tickets.map((ticket) => (
                    <Link
                      key={ticket.id}
                      to={`/tickets/${ticket.id}`}
                      className="ticket-table-row ticket-table-item"
                    >
                      <span className="ticket-title-cell">
                        <strong>{ticket.title}</strong>
                        <span className="ticket-description-preview">
                          {ticket.description}
                        </span>
                      </span>

                      <span className="ticket-user-cell">
                        <strong>{ticket.customer.name}</strong>
                        <span>{ticket.customer.email}</span>
                      </span>

                      <span className="ticket-user-cell">
                        <strong>{ticket.assignee?.name ?? "Unassigned"}</strong>
                        <span>
                          {ticket.assignee ? ticket.assignee.email : "Needs owner"}
                        </span>
                      </span>

                      <span>
                        <StatusBadge status={ticket.status} />
                      </span>

                      <span>
                        <PriorityBadge priority={ticket.priority} />
                      </span>

                      <span className="ticket-table-muted">
                        {formatDate(ticket.createdAt)}
                      </span>
                    </Link>
                  ))}
                </div>
              )}

              {pagination && pagination.totalPages > 1 && (
                <div className="ticket-pagination">
                  <button
                    type="button"
                    className="siq-button"
                    disabled={page <= 1}
                    onClick={() => setPage((current) => Math.max(current - 1, 1))}
                  >
                    Previous
                  </button>

                  <span className="siq-badge">
                    Page {pagination.page} of {pagination.totalPages}
                  </span>

                  <button
                    type="button"
                    className="siq-button"
                    disabled={page >= pagination.totalPages}
                    onClick={() =>
                      setPage((current) =>
                        Math.min(current + 1, pagination.totalPages)
                      )
                    }
                  >
                    Next
                  </button>
                </div>
              )}
            </section>
          )}
        </>
      )}
    </main>
  );
}

function StatusBadge({ status }: { status: TicketStatus }) {
  return (
    <span className={`siq-badge siq-badge-${statusTone(status)}`}>
      {formatLabel(status)}
    </span>
  );
}

function PriorityBadge({ priority }: { priority: TicketPriority }) {
  return (
    <span className={`siq-badge siq-badge-${priorityTone(priority)}`}>
      {formatLabel(priority)}
    </span>
  );
}

function formatLabel(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(" ");
}

function formatDate(value: string) {
  return new Date(value).toLocaleString(undefined, {
    month: "short",
    day: "numeric"
  });
}

function statusTone(status: TicketStatus) {
  if (status === "OPEN") return "blue";
  if (status === "IN_PROGRESS") return "purple";
  if (status === "WAITING") return "orange";
  if (status === "RESOLVED") return "green";
  return "slate";
}

function priorityTone(priority: TicketPriority) {
  if (priority === "LOW") return "green";
  if (priority === "MEDIUM") return "orange";
  if (priority === "HIGH") return "red";
  if (priority === "URGENT") return "red";
  return "slate";
}