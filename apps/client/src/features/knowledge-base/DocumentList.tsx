import {
  type KnowledgeDocument,
  useDeleteKnowledgeDocumentMutation,
  useReprocessKnowledgeDocumentMutation
} from "./kbApi";

type Props = {
  orgId: string;
  documents: KnowledgeDocument[];
  isLoading: boolean;
  isError: boolean;
};

export function DocumentList({ orgId, documents, isLoading, isError }: Props) {
  const [deleteDocument, { isLoading: isDeleting }] =
    useDeleteKnowledgeDocumentMutation();

  const [reprocessDocument, { isLoading: isReprocessing }] =
    useReprocessKnowledgeDocumentMutation();

  async function handleDelete(documentId: string) {
    const confirmed = window.confirm("Delete this document?");

    if (!confirmed) return;

    try {
      await deleteDocument({
        orgId,
        documentId
      }).unwrap();
    } catch (error) {
      console.error("Failed to delete document:", error);
    }
  }

  async function handleReprocess(documentId: string) {
    try {
      await reprocessDocument({
        orgId,
        documentId
      }).unwrap();
    } catch (error) {
      console.error("Failed to reprocess document:", error);
    }
  }

  return (
    <section
      style={{
        border: "1px solid #ddd",
        borderRadius: 8,
        padding: "1rem",
        marginBottom: "1.5rem"
      }}
    >
      <h2>Documents</h2>

      {isLoading && <p>Loading documents...</p>}

      {isError && <p style={{ color: "red" }}>Failed to load documents.</p>}

      {!isLoading && !isError && documents.length === 0 && (
        <p>No knowledge documents uploaded yet.</p>
      )}

      <div style={{ display: "grid", gap: "0.75rem" }}>
        {documents.map((document) => (
          <article
            key={document.id}
            style={{
              border: "1px solid #eee",
              borderRadius: 8,
              padding: "0.75rem"
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: "1rem",
                alignItems: "flex-start"
              }}
            >
              <div>
                <h3 style={{ marginTop: 0 }}>{document.originalName}</h3>

                <p style={{ marginBottom: "0.25rem" }}>
                  Status: <strong>{document.status}</strong>
                </p>

                <p style={{ marginBottom: "0.25rem" }}>
                  Chunks: <strong>{document._count?.chunks ?? 0}</strong>
                </p>

                <p style={{ marginBottom: "0.25rem" }}>
                  Size: {formatBytes(document.sizeBytes)}
                </p>

                <p style={{ marginBottom: 0 }}>
                  Uploaded by {document.uploadedBy.name} on{" "}
                  {new Date(document.createdAt).toLocaleString()}
                </p>

                {document.errorMessage && (
                  <p style={{ color: "red" }}>Error: {document.errorMessage}</p>
                )}
              </div>

              <div style={{ display: "flex", gap: "0.5rem" }}>
                <button
                  type="button"
                  onClick={() => handleReprocess(document.id)}
                  disabled={isReprocessing}
                >
                  Reprocess
                </button>

                <button
                  type="button"
                  onClick={() => handleDelete(document.id)}
                  disabled={isDeleting}
                >
                  Delete
                </button>
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}