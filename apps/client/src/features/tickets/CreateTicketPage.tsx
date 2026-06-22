import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useListOrganizationsQuery } from "../organizations/orgApi";
import {
  type TicketPriority,
  useCreateTicketMutation
} from "./ticketsApi";

const priorities: TicketPriority[] = ["LOW", "MEDIUM", "HIGH", "URGENT"];

export function CreateTicketPage() {
  const navigate = useNavigate();

  const [selectedOrgId, setSelectedOrgId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<TicketPriority>("MEDIUM");

  const {
    data: orgData,
    isLoading: isLoadingOrganizations,
    isError: isOrganizationsError
  } = useListOrganizationsQuery();

  const [createTicket, { isLoading: isCreating }] = useCreateTicketMutation();

  const organizations = orgData?.data.organizations ?? [];

  useEffect(() => {
    if (!selectedOrgId && organizations.length > 0) {
      setSelectedOrgId(organizations[0].organization.id);
    }
  }, [organizations, selectedOrgId]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedTitle = title.trim();
    const trimmedDescription = description.trim();

    if (!selectedOrgId || !trimmedTitle || !trimmedDescription) return;

    try {
      const response = await createTicket({
        orgId: selectedOrgId,
        title: trimmedTitle,
        description: trimmedDescription,
        priority
      }).unwrap();

      navigate(`/tickets/${response.data.ticket.id}`);
    } catch (error) {
      console.error("Failed to create ticket:", error);
    }
  }

  return (
    <main className="app-page">
      <header style={{ marginBottom: "2rem" }}>
        <Link to="/tickets">← Back to tickets</Link>
        <h1 style={{ marginTop: "1rem" }}>Create Ticket</h1>
        <p>Submit a new customer support request.</p>
      </header>

      {isLoadingOrganizations && <p>Loading organizations...</p>}

      {isOrganizationsError && (
        <p style={{ color: "red" }}>Failed to load organizations.</p>
      )}

      {!isLoadingOrganizations && organizations.length === 0 && (
        <section>
          <p>You need to create or join an organization before creating tickets.</p>
          <Link to="/organizations">Go to organizations</Link>
        </section>
      )}

      {organizations.length > 0 && (
        <form
          onSubmit={handleSubmit}
          style={{
            display: "grid",
            gap: "1rem",
            maxWidth: 640
          }}
        >
          <label>
            Organization
            <select
              value={selectedOrgId}
              onChange={(event) => setSelectedOrgId(event.target.value)}
              style={{
                display: "block",
                width: "100%",
                padding: "0.7rem",
                marginTop: "0.4rem"
              }}
            >
              {organizations.map((item) => (
                <option key={item.organization.id} value={item.organization.id}>
                  {item.organization.name} ({item.role})
                </option>
              ))}
            </select>
          </label>

          <label>
            Title
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Example: I cannot reset my password"
              style={{
                display: "block",
                width: "100%",
                padding: "0.7rem",
                marginTop: "0.4rem"
              }}
            />
          </label>

          <label>
            Description
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Describe the issue clearly..."
              rows={6}
              style={{
                display: "block",
                width: "100%",
                padding: "0.7rem",
                marginTop: "0.4rem",
                resize: "vertical"
              }}
            />
          </label>

          <label>
            Priority
            <select
              value={priority}
              onChange={(event) =>
                setPriority(event.target.value as TicketPriority)
              }
              style={{
                display: "block",
                width: "100%",
                padding: "0.7rem",
                marginTop: "0.4rem"
              }}
            >
              {priorities.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>

          <button
            type="submit"
            disabled={
              isCreating ||
              !selectedOrgId ||
              !title.trim() ||
              !description.trim()
            }
          >
            {isCreating ? "Creating..." : "Create ticket"}
          </button>
        </form>
      )}
    </main>
  );
}