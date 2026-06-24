import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import {
  type OrganizationMember,
  type Role,
  useAddMemberMutation,
  useListMembersQuery,
  useListOrganizationsQuery,
  useRemoveMemberMutation,
  useUpdateMemberRoleMutation
} from "./orgApi";
import "./organizations.css";

const editableRoles: Exclude<Role, "OWNER">[] = ["ADMIN", "AGENT", "CUSTOMER"];

export function MembersPage() {
  const { orgId } = useParams();

  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Exclude<Role, "OWNER">>("AGENT");
  const [formError, setFormError] = useState("");
  const [message, setMessage] = useState("");

  const {
    data,
    isLoading,
    isError
  } = useListMembersQuery(orgId ?? "", {
    skip: !orgId
  });

  const { data: orgData } = useListOrganizationsQuery();

  const selectedOrg = orgData?.data.organizations.find(
    (item) => item.organization.id === orgId
  );

  const [addMember, { isLoading: isAdding }] = useAddMemberMutation();

  const [updateMemberRole, { isLoading: isUpdatingRole }] =
    useUpdateMemberRoleMutation();

  const [removeMember, { isLoading: isRemoving }] = useRemoveMemberMutation();

  const members = data?.data.members ?? [];

  const counts = useMemo(() => {
    return {
      total: members.length,
      owners: members.filter((member) => member.role === "OWNER").length,
      admins: members.filter((member) => member.role === "ADMIN").length,
      agents: members.filter((member) => member.role === "AGENT").length,
      customers: members.filter((member) => member.role === "CUSTOMER").length
    };
  }, [members]);

  async function handleAddMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedEmail = email.trim();

    if (!orgId) {
      setFormError("Organization id is missing.");
      return;
    }

    if (!trimmedEmail) {
      setFormError("Please enter a user email.");
      return;
    }

    setFormError("");
    setMessage("");

    try {
      await addMember({
        orgId,
        email: trimmedEmail,
        role
      }).unwrap();

      setEmail("");
      setRole("AGENT");
      setMessage("Member added successfully.");
    } catch (error) {
      console.error("Failed to add member:", error);
      setFormError(
        "Failed to add member. The user must already have a SupportIQ account."
      );
    }
  }

  async function handleRoleChange(
    memberId: string,
    nextRole: Exclude<Role, "OWNER">
  ) {
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

  return (
    <main className="app-page member-page">
      <header className="siq-page-header">
        <div className="siq-page-title">
          <Link to="/organizations" className="ticket-back-link">
            ← Back to organizations
          </Link>

          <p className="org-eyebrow" style={{ marginTop: "1rem" }}>
            Access Control
          </p>

          <h1>Organization Members</h1>

          <p>
            Manage users and roles
            {selectedOrg ? ` for ${selectedOrg.organization.name}` : ""}.
          </p>
        </div>

        <div className="siq-toolbar">
          <Link to="/tickets" className="siq-button">
            Tickets
          </Link>

          <Link to="/knowledge-base" className="siq-button siq-button-primary">
            Knowledge Base
          </Link>
        </div>
      </header>

      <section className="member-main-grid">
        <section className="siq-card member-add-card">
          <div className="member-add-icon">+</div>

          <h2>Add member</h2>
          <p>
            Add an existing SupportIQ user to this organization and assign their
            access level.
          </p>

          <form onSubmit={handleAddMember} className="member-form">
            {formError && <p className="member-error-message">{formError}</p>}
            {message && <p className="member-success-message">{message}</p>}

            <div className="member-field">
              <label htmlFor="member-email">User email</label>
              <input
                id="member-email"
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value);
                  setFormError("");
                  setMessage("");
                }}
                placeholder="user@example.com"
                type="email"
              />
              <small>The user must already have an account.</small>
            </div>

            <div className="member-field">
              <label htmlFor="member-role">Role</label>
              <select
                id="member-role"
                value={role}
                onChange={(event) =>
                  setRole(event.target.value as Exclude<Role, "OWNER">)
                }
              >
                {editableRoles.map((item) => (
                  <option key={item} value={item}>
                    {formatLabel(item)}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="submit"
              className="siq-button siq-button-primary"
              disabled={isAdding || !email.trim()}
            >
              {isAdding ? "Adding..." : "Add member"}
            </button>
          </form>
        </section>

        <section className="siq-card member-list-card">
          <div className="member-list-top">
            <div>
              <h2>Members</h2>
              <p>
                {counts.total} users · {counts.owners} owner · {counts.admins} admin ·{" "}
                {counts.agents} agent · {counts.customers} customer
              </p>
            </div>

            {isLoading && <span className="siq-badge siq-badge-blue">Loading</span>}
          </div>

          {isError && (
            <div className="member-alert member-alert-error">
              Failed to load members.
            </div>
          )}

          {!isLoading && !isError && members.length === 0 && (
            <div className="member-empty-state">
              No members found for this organization.
            </div>
          )}

          {members.length > 0 && (
            <div className="member-table">
              <div className="member-row member-head">
                <span>User</span>
                <span>Role</span>
                <span>Joined</span>
                <span>Actions</span>
              </div>

              {members.map((member) => (
                <MemberRow
                  key={member.id}
                  member={member}
                  isUpdatingRole={isUpdatingRole}
                  isRemoving={isRemoving}
                  onRoleChange={handleRoleChange}
                  onRemove={handleRemoveMember}
                />
              ))}
            </div>
          )}
        </section>
      </section>
    </main>
  );
}

function MemberRow({
  member,
  isUpdatingRole,
  isRemoving,
  onRoleChange,
  onRemove
}: {
  member: OrganizationMember;
  isUpdatingRole: boolean;
  isRemoving: boolean;
  onRoleChange: (
    memberId: string,
    nextRole: Exclude<Role, "OWNER">
  ) => Promise<void>;
  onRemove: (memberId: string) => Promise<void>;
}) {
  return (
    <article className="member-row member-item">
      <div className="member-user">
        <div className="member-avatar">
          {(member.user.name[0] ?? "U").toUpperCase()}
        </div>

        <div>
          <strong>{member.user.name}</strong>
          <span>{member.user.email}</span>
        </div>
      </div>

      <div>
        {member.role === "OWNER" ? (
          <RoleBadge role={member.role} />
        ) : (
          <select
            value={member.role}
            onChange={(event) =>
              onRoleChange(
                member.id,
                event.target.value as Exclude<Role, "OWNER">
              )
            }
            disabled={isUpdatingRole}
            className="member-role-select"
          >
            {editableRoles.map((item) => (
              <option key={item} value={item}>
                {formatLabel(item)}
              </option>
            ))}
          </select>
        )}
      </div>

      <span className="member-muted">{formatDate(member.createdAt)}</span>

      <div className="member-actions">
        {member.role === "OWNER" ? (
          <span className="siq-badge">Protected</span>
        ) : (
          <button
            type="button"
            className="siq-button member-danger-button"
            onClick={() => onRemove(member.id)}
            disabled={isRemoving}
          >
            Remove
          </button>
        )}
      </div>
    </article>
  );
}

function RoleBadge({ role }: { role: Role }) {
  return (
    <span className={`siq-badge member-role-${role.toLowerCase()}`}>
      {formatLabel(role)}
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

function formatDate(value: string) {
  return new Date(value).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric"
  });
}