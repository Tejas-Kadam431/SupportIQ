import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useListOrganizationsQuery } from "../organizations/orgApi";
import {
  type TicketPriority,
  useCreateTicketMutation
} from "./ticketsApi";
import "./tickets.css";
import { getApiErrorMessage } from "../../utils/getApiErrorMessage";

const priorities: TicketPriority[] = ["LOW", "MEDIUM", "HIGH", "URGENT"];

export function CreateTicketPage() {
  const navigate = useNavigate();

  const [selectedOrgId, setSelectedOrgId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<TicketPriority>("MEDIUM");
  const [formError, setFormError] = useState("");

  const {
    data: orgData,
    isLoading: isLoadingOrganizations,
    isError: isOrganizationsError
  } = useListOrganizationsQuery();

  const [createTicket, { isLoading: isCreating }] = useCreateTicketMutation();

  const organizations = orgData?.data.organizations ?? [];

  const selectedOrg = useMemo(() => {
    return organizations.find((item) => item.organization.id === selectedOrgId);
  }, [organizations, selectedOrgId]);

  useEffect(() => {
    if (!selectedOrgId && organizations.length > 0) {
      setSelectedOrgId(organizations[0].organization.id);
    }
  }, [organizations, selectedOrgId]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedTitle = title.trim();
    const trimmedDescription = description.trim();

    if (!selectedOrgId) {
      setFormError("Please select an organization.");
      return;
    }

    if (!trimmedTitle) {
      setFormError("Please enter a ticket title.");
      return;
    }

    if (!trimmedDescription) {
      setFormError("Please enter a ticket description.");
      return;
    }

    setFormError("");

    try {
      const response = await createTicket({
        orgId: selectedOrgId,
        title: trimmedTitle,
        description: trimmedDescription,
        priority
      }).unwrap();

      navigate(`/tickets/${response.data.ticket.id}`);
    }
    catch (error) {
      console.error("Failed to create ticket:", error);
      setFormError(
        getApiErrorMessage(
          error,
          "Failed to create ticket. Please check your session and try again."
        )
      );
    }
  }

  return (
    <main className="app-page ticket-create-page">
      <header className="ticket-shell-header">
        <div>
          <Link to="/tickets" className="ticket-back-link">
            ← Back to tickets
          </Link>

          <p className="ticket-eyebrow" style={{ marginTop: "1rem" }}>
            New Support Request
          </p>

          <h1>Create Ticket</h1>

          <p>
            Capture the customer issue clearly so agents and AI draft generation
            have enough context to respond well.
          </p>
        </div>
      </header>

      {isLoadingOrganizations && (
        <section className="siq-card siq-card-padding ticket-loading">
          Loading organizations...
        </section>
      )}

      {isOrganizationsError && (
        <section className="ticket-alert ticket-alert-error">
          Failed to load organizations.
        </section>
      )}

      {!isLoadingOrganizations && organizations.length === 0 && (
        <section className="siq-card siq-card-padding ticket-empty-state">
          <h2>No organization found</h2>
          <p>You need to create or join an organization before creating tickets.</p>
          <Link to="/organizations" className="siq-button siq-button-primary">
            Go to organizations
          </Link>
        </section>
      )}

      {organizations.length > 0 && (
        <section className="ticket-create-grid">
          <form onSubmit={handleSubmit} className="siq-card ticket-create-form-card">
            <div className="siq-card-header">
              <div>
                <h2 className="siq-card-title">Ticket details</h2>
                <p className="dashboard-card-subtitle">
                  Add a clear title, detailed description, and priority level.
                </p>
              </div>
            </div>

            {formError && (
              <div className="ticket-alert ticket-alert-error">{formError}</div>
            )}

            <div className="ticket-form-grid">
              <div className="ticket-field">
                <label htmlFor="ticket-org">Organization</label>
                <select
                  id="ticket-org"
                  value={selectedOrgId}
                  onChange={(event) => setSelectedOrgId(event.target.value)}
                >
                  {organizations.map((item) => (
                    <option key={item.organization.id} value={item.organization.id}>
                      {item.organization.name} ({item.role})
                    </option>
                  ))}
                </select>
              </div>

              <div className="ticket-field">
                <label htmlFor="ticket-priority">Priority</label>
                <select
                  id="ticket-priority"
                  value={priority}
                  onChange={(event) =>
                    setPriority(event.target.value as TicketPriority)
                  }
                >
                  {priorities.map((item) => (
                    <option key={item} value={item}>
                      {formatLabel(item)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="ticket-field ticket-field-full">
                <label htmlFor="ticket-title">Title</label>
                <input
                  id="ticket-title"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="Example: Customer cannot reset password"
                  maxLength={140}
                />
                <small>{title.trim().length}/140 characters</small>
              </div>

              <div className="ticket-field ticket-field-full">
                <label htmlFor="ticket-description">Description</label>
                <textarea
                  id="ticket-description"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="Describe what happened, what the customer expected, steps already tried, and any useful context..."
                  rows={9}
                />
                <small>
                  Add enough context for agents and AI draft generation to respond
                  accurately.
                </small>
              </div>
            </div>

            <div className="ticket-create-actions">
              <Link to="/tickets" className="siq-button">
                Cancel
              </Link>

              <button
                type="submit"
                className="siq-button siq-button-primary"
                disabled={
                  isCreating ||
                  !selectedOrgId ||
                  !title.trim() ||
                  !description.trim()
                }
              >
                {isCreating ? "Creating..." : "Create ticket"}
              </button>
            </div>
          </form>

          <aside className="ticket-create-side">
            <section className="siq-card ticket-create-help-card">
              <div className="ticket-create-help-icon">✓</div>
              <h2>What happens next?</h2>

              <div className="ticket-create-steps">
                <article>
                  <strong>1. Ticket enters queue</strong>
                  <p>
                    The ticket appears in the selected organization’s support queue.
                  </p>
                </article>

                <article>
                  <strong>2. Agent can assign and update status</strong>
                  <p>
                    Staff can assign ownership, move status, and add internal notes.
                  </p>
                </article>

                <article>
                  <strong>3. AI draft can assist response</strong>
                  <p>
                    Inside ticket details, AI can generate a reply using ticket
                    context and knowledge-base sources.
                  </p>
                </article>

                <article>
                  <strong>4. Activity is tracked</strong>
                  <p>
                    Status changes, messages, notes, and AI actions are shown in
                    the audit timeline.
                  </p>
                </article>
              </div>
            </section>

            <section className="siq-card ticket-create-summary-card">
              <h2>Ticket preview</h2>

              <div className="ticket-preview-box">
                <span className={`siq-badge siq-badge-${priorityTone(priority)}`}>
                  {formatLabel(priority)}
                </span>

                <h3>{title.trim() || "Ticket title will appear here"}</h3>

                <p>
                  {description.trim() ||
                    "Ticket description preview will appear here as you type."}
                </p>

                <div className="ticket-preview-meta">
                  <span>Org</span>
                  <strong>
                    {selectedOrg?.organization.name ?? "No organization selected"}
                  </strong>
                </div>
              </div>
            </section>
          </aside>
        </section>
      )}
    </main>
  );
}

function formatLabel(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(" ");
}

function priorityTone(priority: TicketPriority) {
  if (priority === "LOW") return "green";
  if (priority === "MEDIUM") return "orange";
  if (priority === "HIGH") return "red";
  if (priority === "URGENT") return "red";
  return "slate";
}