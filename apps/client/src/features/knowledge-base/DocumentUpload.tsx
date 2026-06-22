import { useRef, useState } from "react";
import { useUploadKnowledgeDocumentMutation } from "./kbApi";

type Props = {
  orgId: string;
};

export function DocumentUpload({ orgId }: Props) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadError, setUploadError] = useState("");

  const [uploadDocument, { isLoading }] = useUploadKnowledgeDocumentMutation();

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedFile) {
      setUploadError("Please select a file first.");
      return;
    }

    setUploadError("");

    try {
      await uploadDocument({
        orgId,
        file: selectedFile
      }).unwrap();

      setSelectedFile(null);

      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    } catch (error) {
      console.error("Failed to upload document:", error);
      setUploadError("Failed to upload document.");
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
      <h2>Upload document</h2>
      <p>Upload PDF, TXT, or Markdown documents for your support knowledge base.</p>

      <form onSubmit={handleSubmit}>
        <input
          ref={fileInputRef}
          name="file"
          type="file"
          accept=".pdf,.txt,.md,.markdown,application/pdf,text/plain,text/markdown"
          onChange={(event) => {
            setSelectedFile(event.target.files?.[0] ?? null);
            setUploadError("");
          }}
        />

        <button
          type="submit"
          disabled={isLoading || !selectedFile}
          style={{ marginLeft: "0.75rem" }}
        >
          {isLoading ? "Uploading..." : "Upload"}
        </button>
      </form>

      {selectedFile && (
        <p style={{ fontSize: "0.9rem" }}>
          Selected: {selectedFile.name} ({formatBytes(selectedFile.size)})
        </p>
      )}

      {uploadError && <p style={{ color: "red" }}>{uploadError}</p>}
    </section>
  );
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}