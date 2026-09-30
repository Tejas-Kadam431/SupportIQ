import { HistoryPages } from "../../components/HistoryPages";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useListOrganizationsQuery } from "../organizations/orgApi";
import { DocumentList } from "./DocumentList";
import { DocumentUpload } from "./DocumentUpload";
import { KnowledgeSearch } from "./KnowledgeSearch";
import { useListKnowledgeDocumentsQuery } from "./kbApi";
import "./kb.css";

export function KnowledgeBasePage() {
  const [page, setPage] = useState(1);
  const [chosenOrgId, setSelectedOrgId] = useState("");

  const {
    data: orgData,
    isLoading: isLoadingOrganizations,
    isError: isOrganizationsError
  } = useListOrganizationsQuery();

  const organizations = useMemo(() => orgData?.data.organizations.filter(item => item.role !== "CUSTOMER") ?? [], [orgData]);
  const selectedOrgId = organizations.some(item => item.organization.id === chosenOrgId) ? chosenOrgId : organizations[0]?.organization.id ?? "";


  const {
    data: documentData,
    isLoading: isLoadingDocuments,
    isError: isDocumentsError,
    isFetching
  } = useListKnowledgeDocumentsQuery({ orgId: selectedOrgId, page }, {
    skip: !selectedOrgId,
    pollingInterval: selectedOrgId ? 5000 : 0
  });

  const documents = useMemo(() => documentData?.data.documents ?? [], [documentData]);

  const stats = useMemo(() => {
    return {
      total: documents.length,
      ready: documents.filter((document) => !!document.currentPublishedVersionId).length,
      processing: documents.filter(
        (document) =>
          document.versions?.[0]?.status === "PROCESSING" || document.versions?.[0]?.status === "UPLOADED"
      ).length,
      failed: documents.filter((document) => document.versions?.[0]?.status === "FAILED").length,
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
            onChange={(event) => { setSelectedOrgId(event.target.value); setPage(1); }}
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
          <h2>Staff access required</h2>
          <p>Knowledge administration is available only to staff in their organization.</p>
          <Link to="/organizations" className="siq-button siq-button-primary">
            Go to organizations
          </Link>
        </section>
      )}

      {selectedOrgId && (
        <>
          <p>Counts below describe this page of documents.</p>
          <section className="kb-stats-grid">
            <KbMetric title="Documents" value={stats.total} hint="Uploaded files" />
            <KbMetric title="Published" value={stats.ready} hint="Searchable documents" />
            <KbMetric
              title="Processing"
              value={stats.processing}
              hint="Background jobs running"
            />
            <KbMetric title="Chunks" value={stats.chunks} hint="Indexed KB chunks" />
            <KbMetric title="Failed" value={stats.failed} hint="Needs attention" />
          </section>

          <section className="kb-main-grid">
            {["OWNER","ADMIN"].includes(organizations.find(item=>item.organization.id===selectedOrgId)?.role??"") && <DocumentUpload orgId={selectedOrgId} />}

            <KnowledgeSearch orgId={selectedOrgId} />
          </section>

          <DocumentList
            orgId={selectedOrgId}
            canManage={["OWNER","ADMIN"].includes(organizations.find(item=>item.organization.id===selectedOrgId)?.role??"")}
            documents={documents}
            isLoading={isLoadingDocuments}
            isError={isDocumentsError}
            isFetching={isFetching}
          />
          <HistoryPages page={page} count={documents.length} onChange={setPage} />
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