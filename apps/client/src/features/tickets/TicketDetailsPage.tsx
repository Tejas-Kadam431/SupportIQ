import type { ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { useAppSelector } from "../../app/hooks";
import {
  type TicketPriority,
  type TicketStatus,
  useAssignTicketMutation,
  useGetTicketQuery,
  useUpdateTicketStatusMutation
} from "./ticketsApi";
import { MessageThread } from "./MessageThread";
import { InternalNotes } from "./InternalNotes";
import { AiDraftPanel } from "./AiDraftPanel";
import { ActivityTimeline } from "./ActivityTimeline";
import "./tickets.css";

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
      <main className="app-page ticket-detail-page">
        <section className="siq-card siq-card-padding ticket-loading">
          Loading ticket...
        </section>
      </main>
    );
  }

  if (isError || !ticket) {
    return (
      <main className="app-page ticket-detail-page">
        <section className="siq-card siq-card-padding ticket-alert ticket-alert-error">
          <h1>Ticket not found</h1>
          <p>Could not load this ticket.</p>
          <button type="button" className="siq-button" onClick={() => refetch()}>
            Retry
          </button>
          <br />
          <br />
          <Link to="/tickets" className="ticket-back-link">
            Back to tickets
          </Link>
        </section>
      </main>
    );
  }

  return (
    <main className="app-page ticket-detail-page">
      <section className="siq-card ticket-detail-hero">
        <div className="ticket-detail-hero-top">
          <div>
            <Link to="/tickets" className="ticket-back-link">
              ← Back to tickets
            </Link>

            <h1>{ticket.title}</h1>

            <div className="ticket-badge-row">
              <StatusBadge status={ticket.status} />
              <PriorityBadge priority={ticket.priority} />
              <span className="siq-badge">#{ticket.id.slice(0, 8)}</span>
            </div>
          </div>

          <div className="ticket-toolbar">
            <Link to="/tickets/new" className="siq-button">
              New Ticket
            </Link>
          </div>
        </div>

        <p className="ticket-detail-description">{ticket.description}</p>
      </section>

      <section className="ticket-info-grid">
        <InfoCard title="Organization" value={ticket.organization.name} />
        <InfoCard
          title="Customer"
          value={
            <>
              {ticket.customer.name}
              <br />
              <span className="siq-muted">{ticket.customer.email}</span>
            </>
          }
        />
        <InfoCard
          title="Assignee"
          value={
            ticket.assignee ? (
              <>
                {ticket.assignee.name}
                <br />
                <span className="siq-muted">{ticket.assignee.email}</span>
              </>
            ) : (
              "Unassigned"
            )
          }
        />
        <InfoCard title="Created" value={formatFullDate(ticket.createdAt)} />
        <InfoCard
          title="First Response"
          value={
            ticket.firstResponseAt
              ? formatFullDate(ticket.firstResponseAt)
              : "Not responded yet"
          }
        />
        <InfoCard
          title="Resolved"
          value={ticket.resolvedAt ? formatFullDate(ticket.resolvedAt) : "Not resolved"}
        />
      </section>

      <section className="siq-card ticket-actions-card">
        <div className="siq-card-header">
          <div>
            <h2 className="siq-card-title">Ticket Actions</h2>
            <p className="dashboard-card-subtitle">
              Update status or assignment for this support request.
            </p>
          </div>
        </div>

        <div className="ticket-actions-grid">
          <div className="ticket-field" style={{ minWidth: 220 }}>
            <label htmlFor="ticket-status-select">Status</label>
            <select
              id="ticket-status-select"
              value={ticket.status}
              disabled={isUpdatingStatus}
              onChange={(event) =>
                handleStatusChange(event.target.value as TicketStatus)
              }
              className="ticket-action-select"
            >
              {statuses.map((status) => (
                <option key={status} value={status}>
                  {formatLabel(status)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              style={{
                display: "block",
                color: "#475569",
                fontSize: "0.8rem",
                fontWeight: 800,
                marginBottom: "0.35rem"
              }}
            >
              Assignment
            </label>

            <div className="ticket-assignment-actions">
              <button
                type="button"
                className="siq-button siq-button-primary"
                onClick={handleAssignToMe}
                disabled={isAssigning || ticket.assigneeId === user?.id}
              >
                {isAssigning ? "Assigning..." : "Assign to me"}
              </button>

              <button
                type="button"
                className="siq-button"
                onClick={handleUnassign}
                disabled={isAssigning || !ticket.assigneeId}
              >
                Unassign
              </button>
            </div>
          </div>
        </div>
      </section>

      <AiDraftPanel ticketId={ticket.id} />

      <section className="ticket-workspace-grid">
        <MessageThread ticketId={ticket.id} />

        <aside className="ticket-side-stack">
          <InternalNotes ticketId={ticket.id} />
          <ActivityTimeline ticketId={ticket.id} />
        </aside>
      </section>
    </main>
  );
}

type InfoCardProps = {
  title: string;
  value: ReactNode;
};

function InfoCard({ title, value }: InfoCardProps) {
  return (
    <article className="siq-card ticket-info-card">
      <strong>{title}</strong>
      <p>{value}</p>
    </article>
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

function formatFullDate(value: string) {
  return new Date(value).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
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