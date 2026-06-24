import { useListTicketActivityQuery } from "./activityApi";
import type { ActivityType } from "./activityApi";
import "./tickets.css";

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

const activityIcons: Record<ActivityType, string> = {
  TICKET_CREATED: "+",
  TICKET_ASSIGNED: "↗",
  STATUS_CHANGED: "↻",
  MESSAGE_SENT: "✉",
  INTERNAL_NOTE_ADDED: "✎",
  AI_REPLY_GENERATED: "✦",
  DOCUMENT_UPLOADED: "⬆"
};

export function ActivityTimeline({ ticketId }: Props) {
  const {
    data,
    isLoading,
    isError
  } = useListTicketActivityQuery(ticketId);

  const activities = data?.data.activities ?? [];

  return (
    <section className="siq-card activity-card">
      <div className="siq-card-header">
        <div>
          <h2 className="siq-card-title">Activity Timeline</h2>
          <p className="dashboard-card-subtitle">
            Audit trail for ticket changes and support actions.
          </p>
        </div>

        <span className="siq-badge">Audit</span>
      </div>

      {isLoading && <div className="ticket-loading">Loading activity...</div>}

      {isError && (
        <div className="ticket-alert ticket-alert-error">
          Activity timeline is unavailable for this user.
        </div>
      )}

      {!isLoading && !isError && activities.length === 0 && (
        <div className="ticket-empty-state">No activity yet.</div>
      )}

      <div className="activity-list">
        {activities.map((activity) => (
          <article key={activity.id} className="activity-item">
            <div className="activity-icon">{activityIcons[activity.type]}</div>

            <div className="activity-content">
              <div className="activity-content-top">
                <strong>{activityLabels[activity.type]}</strong>
                <small>{new Date(activity.createdAt).toLocaleString()}</small>
              </div>

              <p>{activity.message}</p>

              <span>
                {activity.actor
                  ? `${activity.actor.name} · ${activity.actor.email}`
                  : "System"}
              </span>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}