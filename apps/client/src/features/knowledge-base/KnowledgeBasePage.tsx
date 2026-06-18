import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useListOrganizationsQuery } from "../organizations/orgApi";
import { DocumentList } from "./DocumentList";
import { DocumentUpload } from "./DocumentUpload";
import { KnowledgeSearch } from "./KnowledgeSearch";
import { useListKnowledgeDocumentsQuery } from "./kbApi";

export function KnowledgeBasePage() {
  const [selectedOrgId, setSelectedOrgId] = useState("");

  const {
    data: orgData,
    isLoading: isLoadingOrganizations,
    isError: isOrganizationsError
  } = useListOrganizationsQuery();

  const organizations = orgData?.data.organizations ?? [];

  useEffect(() => {
    if (!selectedOrgId && organizations.length > 0) {
      setSelectedOrgId(organizations[0].organization.id);
    }
  }, [organizations, selectedOrgId]);

  const {
    data: documentData,
    isLoading: isLoadingDocuments,
    isError: isDocumentsError
  } = useListKnowledgeDocumentsQuery(selectedOrgId, {
    skip: !selectedOrgId
  });

  const documents = documentData?.data.documents ?? [];

  return (
    <main style={{ padding: "2rem", fontFamily: "system-ui" }}>
      <header style={{ marginBottom: "2rem" }}>
        <h1>Knowledge Base</h1>
        <p>Upload support documents and search processed knowledge chunks.</p>

        <nav style={{ display: "flex", gap: "1rem" }}>
          <Link to="/dashboard">Dashboard</Link>
          <Link to="/tickets">Tickets</Link>
          <Link to="/organizations">Organizations</Link>
        </nav>
      </header>

      <section style={{ marginBottom: "1.5rem" }}>
        <label>
          Organization
          <select
            value={selectedOrgId}
            onChange={(event) => setSelectedOrgId(event.target.value)}
            disabled={isLoadingOrganizations}
            style={{
              display: "block",
              padding: "0.7rem",
              marginTop: "0.5rem",
              minWidth: 280
            }}
          >
            {organizations.map((item) => (
              <option key={item.organization.id} value={item.organization.id}>
                {item.organization.name} ({item.role})
              </option>
            ))}
          </select>
        </label>

        {isOrganizationsError && (
          <p style={{ color: "red" }}>Failed to load organizations.</p>
        )}
      </section>

      {!isLoadingOrganizations && organizations.length === 0 && (
        <section>
          <p>No organization found. Create an organization first.</p>
          <Link to="/organizations">Go to organizations</Link>
        </section>
      )}

      {selectedOrgId && (
        <>
          <DocumentUpload orgId={selectedOrgId} />

          <DocumentList
            orgId={selectedOrgId}
            documents={documents}
            isLoading={isLoadingDocuments}
            isError={isDocumentsError}
          />

          <KnowledgeSearch orgId={selectedOrgId} />
        </>
      )}
    </main>
  );
}