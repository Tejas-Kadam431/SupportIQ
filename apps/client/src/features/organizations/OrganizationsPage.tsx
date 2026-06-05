import { useState } from "react";
import { Link } from "react-router-dom";
import {
  useCreateOrganizationMutation,
  useListOrganizationsQuery
} from "./orgApi";

export function OrganizationsPage() {
  const [name, setName] = useState("");
  const { data, isLoading, isError } = useListOrganizationsQuery();
  const [createOrganization, { isLoading: isCreating }] =
    useCreateOrganizationMutation();

  async function handleCreateOrganization(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!name.trim()) return;

    try {
      await createOrganization({ name: name.trim() }).unwrap();
      setName("");
    } catch (error) {
      console.error("Failed to create organization:", error);
    }
  }

  const organizations = data?.data.organizations ?? [];

  return (
    <main style={{ padding: "2rem", fontFamily: "system-ui" }}>
      <header style={{ marginBottom: "2rem" }}>
        <h1>Organizations</h1>
        <p>Create and manage your support workspaces.</p>
        <Link to="/dashboard">Back to dashboard</Link>
      </header>

      <section style={{ marginBottom: "2rem" }}>
        <h2>Create organization</h2>

        <form onSubmit={handleCreateOrganization}>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Example: Acme Support"
            style={{ padding: "0.6rem", width: 300, marginRight: "0.5rem" }}
          />

          <button type="submit" disabled={isCreating}>
            {isCreating ? "Creating..." : "Create"}
          </button>
        </form>
      </section>

      <section>
        <h2>Your organizations</h2>

        {isLoading && <p>Loading organizations...</p>}

        {isError && <p style={{ color: "red" }}>Failed to load organizations.</p>}

        {!isLoading && organizations.length === 0 && (
          <p>No organizations yet. Create one to continue.</p>
        )}

        <div style={{ display: "grid", gap: "1rem", maxWidth: 700 }}>
          {organizations.map((item) => (
            <article
              key={item.organization.id}
              style={{
                border: "1px solid #ddd",
                borderRadius: 8,
                padding: "1rem"
              }}
            >
              <h3>{item.organization.name}</h3>
              <p>Slug: {item.organization.slug}</p>
              <p>Your role: {item.role}</p>

              <Link to={`/organizations/${item.organization.id}/members`}>
                Manage members
              </Link>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}