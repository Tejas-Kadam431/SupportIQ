import { useListTicketActivityQuery } from "./activityApi";
import type { ActivityType } from "./activityApi";

type Props = {
  ticketId: string;
};

const activityLabels: Record<ActivityType, string> = {
  TICKET_CREATED: "Ticket created",
  TICKET_ASSIGNED: "Assignment changed",
  STATUS_CHANGED: "Status changed",
  MESSAGE_SENT: "Message sent",
  INTERNAL_NOTE_ADDED: "Internal note added",
  AI_REPLY_GENERATED: "AI reply generated",
  DOCUMENT_UPLOADED: "Document uploaded"
};

export function ActivityTimeline({ ticketId }: Props) {
  const {
    data,
    isLoading,
    isError
  } = useListTicketActivityQuery(ticketId);

  const activities = data?.data.activities ?? [];

  return (
    <section
      style={{
        border: "1px solid #ddd",
        borderRadius: 8,
        padding: "1rem",
        marginTop: "1.5rem"
      }}
    >
      <h2>Activity Timeline</h2>
      <p style={{ color: "#555" }}>
        Internal audit trail for ticket changes and support actions.
      </p>

      {isLoading && <p>Loading activity...</p>}

      {isError && (
        <p style={{ color: "red" }}>
          Activity timeline is unavailable for this user.
        </p>
      )}

      {!isLoading && !isError && activities.length === 0 && (
        <p>No activity yet.</p>
      )}

      <div style={{ display: "grid", gap: "0.75rem" }}>
        {activities.map((activity) => (
          <article
            key={activity.id}
            style={{
              border: "1px solid #eee",
              borderRadius: 8,
              padding: "0.75rem"
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: "1rem",
                marginBottom: "0.5rem"
              }}
            >
              <strong>{activityLabels[activity.type]}</strong>
              <small>{new Date(activity.createdAt).toLocaleString()}</small>
            </div>

            <p style={{ marginTop: 0 }}>{activity.message}</p>

            <small>
              Actor:{" "}
              {activity.actor
                ? `${activity.actor.name} (${activity.actor.email})`
                : "System"}
            </small>
          </article>
        ))}
      </div>
    </section>
  );
}