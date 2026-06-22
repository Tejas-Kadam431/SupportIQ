import { Link, useParams } from "react-router-dom";
import { useAppSelector } from "../../app/hooks";
import { TicketPriorityBadge } from "./TicketPriorityBadge";
import { TicketStatusBadge } from "./TicketStatusBadge";
import {
  type TicketStatus,
  useAssignTicketMutation,
  useGetTicketQuery,
  useUpdateTicketStatusMutation
} from "./ticketsApi";
import { MessageThread } from "./MessageThread";
import { InternalNotes } from "./InternalNotes";
import { AiDraftPanel } from "./AiDraftPanel";
import { ActivityTimeline } from "./ActivityTimeline";
const statuses: TicketStatus[] = [
  "OPEN",
  "IN_PROGRESS",
  "WAITING",
  "RESOLVED",
  "CLOSED"
];

export function TicketDetailsPage() {
  const { ticketId } = useParams();
  const user = useAppSelector((state) => state.auth.user);

  const {
    data,
    isLoading,
    isError,
    refetch
  } = useGetTicketQuery(ticketId ?? "", {
    skip: !ticketId
  });

  const [updateStatus, { isLoading: isUpdatingStatus }] =
    useUpdateTicketStatusMutation();

  const [assignTicket, { isLoading: isAssigning }] = useAssignTicketMutation();

  const ticket = data?.data.ticket;

  async function handleStatusChange(nextStatus: TicketStatus) {
    if (!ticketId) return;

    try {
      await updateStatus({
        ticketId,
        status: nextStatus
      }).unwrap();
    } catch (error) {
      console.error("Failed to update ticket status:", error);
    }
  }

  async function handleAssignToMe() {
    if (!ticketId || !user) return;

    try {
      await assignTicket({
        ticketId,
        assigneeId: user.id
      }).unwrap();
    } catch (error) {
      console.error("Failed to assign ticket:", error);
    }
  }

  async function handleUnassign() {
    if (!ticketId) return;

    try {
      await assignTicket({
        ticketId,
        assigneeId: null
      }).unwrap();
    } catch (error) {
      console.error("Failed to unassign ticket:", error);
    }
  }

  if (isLoading) {
    return (
      <main style={{ padding: "2rem", fontFamily: "system-ui" }}>
        <p>Loading ticket...</p>
      </main>
    );
  }

  if (isError || !ticket) {
    return (
      <main style={{ padding: "2rem", fontFamily: "system-ui" }}>
        <h1>Ticket not found</h1>
        <p>Could not load this ticket.</p>
        <button type="button" onClick={() => refetch()}>
          Retry
        </button>
        <br />
        <br />
        <Link to="/tickets">Back to tickets</Link>
      </main>
    );
  }

  return (
    <main style={{ padding: "2rem", fontFamily: "system-ui" }}>
      <header style={{ marginBottom: "2rem" }}>
        <Link to="/tickets">← Back to tickets</Link>

        <h1 style={{ marginTop: "1rem" }}>{ticket.title}</h1>

        <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
          <TicketStatusBadge status={ticket.status} />
          <TicketPriorityBadge priority={ticket.priority} />
        </div>

        <p>{ticket.description}</p>
      </header>

      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
          gap: "1rem",
          marginBottom: "2rem"
        }}
      >
        <InfoCard title="Organization" value={ticket.organization.name} />
        <InfoCard title="Customer" value={`${ticket.customer.name} (${ticket.customer.email})`} />
        <InfoCard
          title="Assignee"
          value={
            ticket.assignee
              ? `${ticket.assignee.name} (${ticket.assignee.email})`
              : "Unassigned"
          }
        />
        <InfoCard title="Created" value={new Date(ticket.createdAt).toLocaleString()} />
        <InfoCard
          title="First Response"
          value={
            ticket.firstResponseAt
              ? new Date(ticket.firstResponseAt).toLocaleString()
              : "Not responded yet"
          }
        />
        <InfoCard
          title="Resolved"
          value={
            ticket.resolvedAt
              ? new Date(ticket.resolvedAt).toLocaleString()
              : "Not resolved"
          }
        />
      </section>

      <section
        style={{
          border: "1px solid #ddd",
          borderRadius: 8,
          padding: "1rem",
          marginBottom: "1.5rem"
        }}
      >
        <h2>Ticket Actions</h2>

        <div
          style={{
            display: "flex",
            gap: "1rem",
            flexWrap: "wrap",
            alignItems: "center"
          }}
        >
          <label>
            Status
            <select
              value={ticket.status}
              disabled={isUpdatingStatus}
              onChange={(event) =>
                handleStatusChange(event.target.value as TicketStatus)
              }
              style={{
                display: "block",
                padding: "0.6rem",
                marginTop: "0.5rem"
              }}
            >
              {statuses.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </label>

          <div>
            <p style={{ marginBottom: "0.5rem" }}>Assignment</p>

            <button
              type="button"
              onClick={handleAssignToMe}
              disabled={isAssigning || ticket.assigneeId === user?.id}
              style={{ marginRight: "0.5rem" }}
            >
              {isAssigning ? "Assigning..." : "Assign to me"}
            </button>

            <button
              type="button"
              onClick={handleUnassign}
              disabled={isAssigning || !ticket.assigneeId}
            >
              Unassign
            </button>
          </div>
        </div>
      </section>
      <AiDraftPanel ticketId={ticket.id} />
      <section
        style={{
          display: "grid",
          gridTemplateColumns: "2fr 1fr",
          gap: "1rem"
        }}
      >
        <MessageThread ticketId={ticket.id} />
        <InternalNotes ticketId={ticket.id} />
      </section>
      <ActivityTimeline ticketId={ticket.id} />
    </main>
  );
}

type InfoCardProps = {
  title: string;
  value: string;
};

function InfoCard({ title, value }: InfoCardProps) {
  return (
    <article
      style={{
        border: "1px solid #ddd",
        borderRadius: 8,
        padding: "1rem"
      }}
    >
      <strong>{title}</strong>
      <p>{value}</p>
    </article>
  );
}