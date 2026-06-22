import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useListOrganizationsQuery } from "../organizations/orgApi";
import { TicketFilters } from "./TicketFilters";
import { TicketPriorityBadge } from "./TicketPriorityBadge";
import { TicketStatusBadge } from "./TicketStatusBadge";
import {
  type TicketPriority,
  type TicketStatus,
  useListTicketsQuery
} from "./ticketsApi";

const PAGE_LIMIT = 10;

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

  function resetToFirstPage() {
    setPage(1);
  }

  function handleSearchChange(value: string) {
    setSearch(value);
    resetToFirstPage();
  }

  function handleStatusChange(value: TicketStatus | "") {
    setStatus(value);
    resetToFirstPage();
  }

  function handlePriorityChange(value: TicketPriority | "") {
    setPriority(value);
    resetToFirstPage();
  }

  return (
    <main className="app-page">
      <header style={{ marginBottom: "2rem" }}>
        <h1>Tickets</h1>
        <p>View, search, and filter customer support tickets.</p>

        <nav style={{ display: "flex", gap: "1rem" }}>
          <Link to="/tickets/new">Create ticket</Link>
          <Link to="/dashboard">Dashboard</Link>
          <Link to="/organizations">Organizations</Link>
        </nav>
      </header>

      <section style={{ marginBottom: "1.5rem" }}>
        <label>
          Organization
          <select
            value={selectedOrgId}
            onChange={(event) => {
              setSelectedOrgId(event.target.value);
              setPage(1);
            }}
            style={{ display: "block", padding: "0.6rem", marginTop: "0.5rem" }}
            disabled={isLoadingOrganizations}
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
          <p>No organization found. Create an organization first.</p>
          <Link to="/organizations">Create organization</Link>
        </section>
      )}

      {selectedOrgId && (
        <>
          <TicketFilters
            search={search}
            status={status}
            priority={priority}
            onSearchChange={handleSearchChange}
            onStatusChange={handleStatusChange}
            onPriorityChange={handlePriorityChange}
          />

          {isLoadingTickets && <p>Loading tickets...</p>}

          {isTicketsError && (
            <p style={{ color: "red" }}>
              Failed to load tickets. Check backend or login session.
            </p>
          )}

          {!isLoadingTickets && tickets.length === 0 && (
            <p>No tickets found for the selected filters.</p>
          )}

          {isFetching && !isLoadingTickets && <p>Refreshing tickets...</p>}

          <div style={{ display: "grid", gap: "1rem" }}>
            {tickets.map((ticket) => (
              <article
                key={ticket.id}
                style={{
                  border: "1px solid #ddd",
                  borderRadius: 8,
                  padding: "1rem"
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: "1rem",
                    alignItems: "flex-start"
                  }}
                >
                  <div>
                    <h2 style={{ marginBottom: "0.25rem" }}>{ticket.title}</h2>
                    <p style={{ marginTop: 0 }}>{ticket.description}</p>
                  </div>

                  <div style={{ display: "flex", gap: "0.5rem" }}>
                    <TicketStatusBadge status={ticket.status} />
                    <TicketPriorityBadge priority={ticket.priority} />
                  </div>
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
                    gap: "1rem",
                    marginTop: "1rem",
                    fontSize: "0.9rem"
                  }}
                >
                  <div>
                    <strong>Customer</strong>
                    <p>{ticket.customer.name}</p>
                  </div>

                  <div>
                    <strong>Assignee</strong>
                    <p>{ticket.assignee ? ticket.assignee.name : "Unassigned"}</p>
                  </div>

                  <div>
                    <strong>Messages</strong>
                    <p>{ticket._count.messages}</p>
                  </div>

                  <div>
                    <strong>Created</strong>
                    <p>{new Date(ticket.createdAt).toLocaleString()}</p>
                  </div>
                </div>

                <div style={{ marginTop: "1rem" }}>
                  <Link to={`/tickets/${ticket.id}`}>Open ticket</Link>
                </div>
              </article>
            ))}
          </div>

          {pagination && pagination.totalPages > 1 && (
            <div
              style={{
                display: "flex",
                gap: "0.75rem",
                alignItems: "center",
                marginTop: "1.5rem"
              }}
            >
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((current) => Math.max(current - 1, 1))}
              >
                Previous
              </button>

              <span>
                Page {pagination.page} of {pagination.totalPages}
              </span>

              <button
                type="button"
                disabled={page >= pagination.totalPages}
                onClick={() =>
                  setPage((current) =>
                    pagination ? Math.min(current + 1, pagination.totalPages) : current
                  )
                }
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </main>
  );
}