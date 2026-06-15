import type { TicketStatus } from "./ticketsApi";

type Props = {
  status: TicketStatus;
};

const statusLabels: Record<TicketStatus, string> = {
  OPEN: "Open",
  IN_PROGRESS: "In Progress",
  WAITING: "Waiting",
  RESOLVED: "Resolved",
  CLOSED: "Closed"
};

export function TicketStatusBadge({ status }: Props) {
  return (
    <span
      style={{
        display: "inline-block",
        padding: "0.25rem 0.5rem",
        borderRadius: 999,
        border: "1px solid #ddd",
        fontSize: "0.85rem"
      }}
    >
      {statusLabels[status]}
    </span>
  );
}