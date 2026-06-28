import { useState } from "react";
import {
  type KnowledgeDocument,
  type KnowledgeDocumentStatus,
  useDeleteKnowledgeDocumentMutation,
  useReprocessKnowledgeDocumentMutation
} from "./kbApi";
import { getApiErrorMessage } from "../../utils/getApiErrorMessage";
import "./kb.css";

type Props = {
  orgId: string;
  documents: KnowledgeDocument[];
  isLoading: boolean;
  isError: boolean;
  isFetching?: boolean;
};

export function DocumentList({
  orgId,
  documents,
  isLoading,
  isError,
  isFetching = false
}: Props) {
  const [actionError, setActionError] = useState("");

  const [deleteDocument, { isLoading: isDeleting }] =
    useDeleteKnowledgeDocumentMutation();

  const [reprocessDocument, { isLoading: isReprocessing }] =
    useReprocessKnowledgeDocumentMutation();

  async function handleDelete(documentId: string) {
    const confirmed = window.confirm("Delete this document?");

    if (!confirmed) return;

    setActionError("");

    try {
      await deleteDocument({
        orgId,
        documentId
      }).unwrap();
    } catch (error) {
      console.error("Failed to delete document:", error);
      setActionError(getApiErrorMessage(error, "Failed to delete document."));
    }
  }

  async function handleReprocess(documentId: string) {
    setActionError("");

    try {
      await reprocessDocument({
        orgId,
        documentId
      }).unwrap();
    } catch (error) {
      console.error("Failed to reprocess document:", error);
      setActionError(getApiErrorMessage(error, "Failed to reprocess document."));
    }
  }

  return (
    <section className="siq-card kb-documents-card">
      <div className="kb-documents-top">
        <div>
          <h2>Documents</h2>
          <p>
            Uploaded files are processed into chunks by background jobs and then
            become searchable.
          </p>
        </div>

        {isFetching && !isLoading && (
          <span className="siq-badge siq-badge-blue">Refreshing</span>
        )}
      </div>

      {isLoading && <div className="kb-loading">Loading documents...</div>}

      {isError && (
        <div className="kb-alert kb-alert-error">Failed to load documents.</div>
      )}

      {actionError && (
        <div className="kb-alert kb-alert-error">{actionError}</div>
      )}

      {!isLoading && !isError && documents.length === 0 && (
        <div className="kb-empty-state">
          <strong>No knowledge documents uploaded yet</strong>
          <p>Upload a document above to start building your support knowledge base.</p>
        </div>
      )}

      {documents.length > 0 && (
        <div className="kb-document-table">
          <div className="kb-document-row kb-document-head">
            <span>Document</span>
            <span>Status</span>
            <span>Chunks</span>
            <span>Size</span>
            <span>Uploaded</span>
            <span>Actions</span>
          </div>

          {documents.map((document) => (
            <article key={document.id} className="kb-document-row kb-document-item">
              <div>
                <strong>{document.originalName}</strong>
                <small>{document.mimeType}</small>

                {document.errorMessage && (
                  <p className="kb-document-error">{document.errorMessage}</p>
                )}
              </div>

              <span>
                <StatusBadge status={document.status} />
              </span>

              <span className="kb-document-muted">
                {document._count?.chunks ?? 0}
              </span>

              <span className="kb-document-muted">
                {formatBytes(document.sizeBytes)}
              </span>

              <span className="kb-document-muted">
                {document.uploadedBy.name}
                <br />
                {formatDate(document.createdAt)}
              </span>

              <div className="kb-document-actions">
                <button
                  type="button"
                  className="siq-button"
                  onClick={() => handleReprocess(document.id)}
                  disabled={isReprocessing}
                >
                  Reprocess
                </button>

                <button
                  type="button"
                  className="siq-button kb-danger-button"
                  onClick={() => handleDelete(document.id)}
                  disabled={isDeleting}
                >
                  Delete
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function StatusBadge({ status }: { status: KnowledgeDocumentStatus }) {
  return (
    <span className={`siq-badge kb-status-${status.toLowerCase()}`}>
      {formatLabel(status)}
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

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(value: string) {
  return new Date(value).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}