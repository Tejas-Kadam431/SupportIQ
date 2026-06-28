import { useRef, useState } from "react";
import { useUploadKnowledgeDocumentMutation } from "./kbApi";
import { getApiErrorMessage } from "../../utils/getApiErrorMessage";
import "./kb.css";

type Props = {
  orgId: string;
};

export function DocumentUpload({ orgId }: Props) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadError, setUploadError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const [uploadDocument, { isLoading }] = useUploadKnowledgeDocumentMutation();

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedFile) {
      setUploadError("Please select a file first.");
      return;
    }

    setUploadError("");
    setSuccessMessage("");

    try {
      await uploadDocument({
        orgId,
        file: selectedFile
      }).unwrap();

      setSuccessMessage(
        "Document uploaded. Background processing will prepare it for search."
      );

      setSelectedFile(null);

      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    } catch (error) {
      console.error("Failed to upload document:", error);
      setUploadError(getApiErrorMessage(error, "Failed to upload document."));
    }
  }

  return (
    <section className="siq-card kb-upload-card">
      <div className="kb-card-header">
        <div>
          <div className="kb-upload-icon">⬆</div>
          <h2>Upload document</h2>
          <p>
            Add PDF, TXT, Markdown, or product docs to make them available for
            knowledge search and AI draft grounding.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="kb-upload-form">
        <label className="kb-file-drop">
          <input
            ref={fileInputRef}
            name="file"
            type="file"
            accept=".pdf,.txt,.md,.markdown,application/pdf,text/plain,text/markdown"
            onChange={(event) => {
              setSelectedFile(event.target.files?.[0] ?? null);
              setUploadError("");
              setSuccessMessage("");
            }}
          />

          <span>Choose file</span>
          <strong>{selectedFile ? selectedFile.name : "No file selected"}</strong>
          <small>
            {selectedFile
              ? formatBytes(selectedFile.size)
              : "Supported: PDF, TXT, MD, Markdown"}
          </small>
        </label>

        <button
          type="submit"
          className="siq-button siq-button-primary"
          disabled={isLoading || !selectedFile}
        >
          {isLoading ? "Uploading..." : "Upload document"}
        </button>
      </form>

      {successMessage && <p className="kb-success-message">{successMessage}</p>}

      {uploadError && <p className="kb-error-message">{uploadError}</p>}
    </section>
  );
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}