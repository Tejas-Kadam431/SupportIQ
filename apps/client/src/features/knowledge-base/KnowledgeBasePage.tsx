import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useListOrganizationsQuery } from "../organizations/orgApi";
import { DocumentList } from "./DocumentList";
import { DocumentUpload } from "./DocumentUpload";
import { KnowledgeSearch } from "./KnowledgeSearch";
import { useListKnowledgeDocumentsQuery } from "./kbApi";
import "./kb.css";

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
    isError: isDocumentsError,
    isFetching
  } = useListKnowledgeDocumentsQuery(selectedOrgId, {
    skip: !selectedOrgId,
    pollingInterval: selectedOrgId ? 5000 : 0
  });

  const documents = documentData?.data.documents ?? [];

  const stats = useMemo(() => {
    return {
      total: documents.length,
      ready: documents.filter((document) => document.status === "READY").length,
      processing: documents.filter(
        (document) =>
          document.status === "PROCESSING" || document.status === "UPLOADED"
      ).length,
      failed: documents.filter((document) => document.status === "FAILED").length,
      chunks: documents.reduce(
        (sum, document) => sum + (document._count?.chunks ?? 0),
        0
      )
    };
  }, [documents]);

  return (
    <main className="app-page kb-page">
      <header className="siq-page-header">
        <div className="siq-page-title">
          <p className="kb-eyebrow">Knowledge Engine</p>
          <h1>Knowledge Base</h1>
          <p>
            Upload support documents, process them into searchable chunks, and
            ground AI replies with real product knowledge.
          </p>
        </div>

        <div className="kb-org-picker">
          <label htmlFor="kb-org">Organization</label>
          <select
            id="kb-org"
            value={selectedOrgId}
            onChange={(event) => setSelectedOrgId(event.target.value)}
            disabled={isLoadingOrganizations}
          >
            {organizations.map((item) => (
              <option key={item.organization.id} value={item.organization.id}>
                {item.organization.name} ({item.role})
              </option>
            ))}
          </select>
        </div>
      </header>

      {isOrganizationsError && (
        <section className="kb-alert kb-alert-error">
          Failed to load organizations.
        </section>
      )}

      {!isLoadingOrganizations && organizations.length === 0 && (
        <section className="siq-card siq-card-padding kb-empty-state">
          <h2>No organization found</h2>
          <p>Create an organization before uploading knowledge documents.</p>
          <Link to="/organizations" className="siq-button siq-button-primary">
            Go to organizations
          </Link>
        </section>
      )}

      {selectedOrgId && (
        <>
          <section className="kb-stats-grid">
            <KbMetric title="Documents" value={stats.total} hint="Uploaded files" />
            <KbMetric title="Ready" value={stats.ready} hint="Searchable documents" />
            <KbMetric
              title="Processing"
              value={stats.processing}
              hint="Background jobs running"
            />
            <KbMetric title="Chunks" value={stats.chunks} hint="Indexed KB chunks" />
            <KbMetric title="Failed" value={stats.failed} hint="Needs attention" />
          </section>

          <section className="kb-main-grid">
            <DocumentUpload orgId={selectedOrgId} />

            <KnowledgeSearch orgId={selectedOrgId} />
          </section>

          <DocumentList
            orgId={selectedOrgId}
            documents={documents}
            isLoading={isLoadingDocuments}
            isError={isDocumentsError}
            isFetching={isFetching}
          />
        </>
      )}
    </main>
  );
}

function KbMetric({
  title,
  value,
  hint
}: {
  title: string;
  value: string | number;
  hint: string;
}) {
  return (
    <article className="siq-card kb-metric-card">
      <p>{title}</p>
      <strong>{value}</strong>
      <small>{hint}</small>
    </article>
  );
}