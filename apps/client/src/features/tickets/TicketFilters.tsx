import type { TicketPriority, TicketStatus } from "./ticketsApi";

type Props = {
  search: string;
  status: TicketStatus | "";
  priority: TicketPriority | "";
  onSearchChange: (value: string) => void;
  onStatusChange: (value: TicketStatus | "") => void;
  onPriorityChange: (value: TicketPriority | "") => void;
};

const statuses: TicketStatus[] = [
  "OPEN",
  "IN_PROGRESS",
  "WAITING",
  "RESOLVED",
  "CLOSED"
];

const priorities: TicketPriority[] = ["LOW", "MEDIUM", "HIGH", "URGENT"];

export function TicketFilters({
  search,
  status,
  priority,
  onSearchChange,
  onStatusChange,
  onPriorityChange
}: Props) {
  return (
    <div
      style={{
        display: "flex",
        gap: "0.75rem",
        flexWrap: "wrap",
        marginBottom: "1rem"
      }}
    >
      <input
        value={search}
        onChange={(event) => onSearchChange(event.target.value)}
        placeholder="Search tickets..."
        style={{ padding: "0.6rem", minWidth: 240 }}
      />

      <select
        value={status}
        onChange={(event) => onStatusChange(event.target.value as TicketStatus | "")}
        style={{ padding: "0.6rem" }}
      >
        <option value="">All statuses</option>
        {statuses.map((item) => (
          <option key={item} value={item}>
            {item}
          </option>
        ))}
      </select>

      <select
        value={priority}
        onChange={(event) =>
          onPriorityChange(event.target.value as TicketPriority | "")
        }
        style={{ padding: "0.6rem" }}
      >
        <option value="">All priorities</option>
        {priorities.map((item) => (
          <option key={item} value={item}>
            {item}
          </option>
        ))}
      </select>
    </div>
  );
}