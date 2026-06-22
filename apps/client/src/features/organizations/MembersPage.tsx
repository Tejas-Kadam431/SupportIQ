import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  type Role,
  useAddMemberMutation,
  useListMembersQuery,
  useRemoveMemberMutation,
  useUpdateMemberRoleMutation
} from "./orgApi";

const editableRoles: Exclude<Role, "OWNER">[] = ["ADMIN", "AGENT", "CUSTOMER"];

export function MembersPage() {
  const { orgId } = useParams();

  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Exclude<Role, "OWNER">>("AGENT");

  const { data, isLoading, isError } = useListMembersQuery(orgId ?? "", {
    skip: !orgId
  });

  const [addMember, { isLoading: isAdding }] = useAddMemberMutation();
  const [updateMemberRole] = useUpdateMemberRoleMutation();
  const [removeMember] = useRemoveMemberMutation();

  async function handleAddMember(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!orgId || !email.trim()) return;

    try {
      await addMember({
        orgId,
        email: email.trim(),
        role
      }).unwrap();

      setEmail("");
      setRole("AGENT");
    } catch (error) {
      console.error("Failed to add member:", error);
    }
  }

  async function handleRoleChange(memberId: string, nextRole: Exclude<Role, "OWNER">) {
    if (!orgId) return;

    try {
      await updateMemberRole({
        orgId,
        memberId,
        role: nextRole
      }).unwrap();
    } catch (error) {
      console.error("Failed to update role:", error);
    }
  }

  async function handleRemoveMember(memberId: string) {
    if (!orgId) return;

    const confirmed = window.confirm("Remove this member?");
    if (!confirmed) return;

    try {
      await removeMember({
        orgId,
        memberId
      }).unwrap();
    } catch (error) {
      console.error("Failed to remove member:", error);
    }
  }

  const members = data?.data.members ?? [];

  return (
    <main className="app-page">
      <header style={{ marginBottom: "2rem" }}>
        <h1>Organization Members</h1>
        <p>Manage users and roles inside this organization.</p>
        <Link to="/organizations">Back to organizations</Link>
      </header>

      <section style={{ marginBottom: "2rem" }}>
        <h2>Add member</h2>
        <p>The user must already have a SupportIQ account.</p>

        <form onSubmit={handleAddMember}>
          <input
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="user@example.com"
            type="email"
            style={{ padding: "0.6rem", width: 300, marginRight: "0.5rem" }}
          />

          <select
            value={role}
            onChange={(event) => setRole(event.target.value as Exclude<Role, "OWNER">)}
            style={{ padding: "0.6rem", marginRight: "0.5rem" }}
          >
            {editableRoles.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>

          <button type="submit" disabled={isAdding}>
            {isAdding ? "Adding..." : "Add member"}
          </button>
        </form>
      </section>

      <section>
        <h2>Members</h2>

        {isLoading && <p>Loading members...</p>}

        {isError && <p style={{ color: "red" }}>Failed to load members.</p>}

        {!isLoading && members.length === 0 && <p>No members found.</p>}

        <div style={{ display: "grid", gap: "1rem", maxWidth: 900 }}>
          {members.map((member) => (
            <article
              key={member.id}
              style={{
                border: "1px solid #ddd",
                borderRadius: 8,
                padding: "1rem"
              }}
            >
              <h3>{member.user.name}</h3>
              <p>{member.user.email}</p>

              <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
                <strong>Role:</strong>

                {member.role === "OWNER" ? (
                  <span>OWNER</span>
                ) : (
                  <select
                    value={member.role}
                    onChange={(event) =>
                      handleRoleChange(
                        member.id,
                        event.target.value as Exclude<Role, "OWNER">
                      )
                    }
                    style={{ padding: "0.5rem" }}
                  >
                    {editableRoles.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                )}

                {member.role !== "OWNER" && (
                  <button
                    type="button"
                    onClick={() => handleRemoveMember(member.id)}
                  >
                    Remove
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}