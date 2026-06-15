import type { TicketPriority } from "./ticketsApi";

type Props = {
  priority: TicketPriority;
};

export function TicketPriorityBadge({ priority }: Props) {
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
      {priority}
    </span>
  );
}