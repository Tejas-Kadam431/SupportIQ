import { useState } from "react";
import { useCreateMessageMutation } from "./messagesApi";
import {
  type AiDraftSource,
  useGenerateAiDraftMutation
} from "./aiApi";

type Props = {
  ticketId: string;
};

export function AiDraftPanel({ ticketId }: Props) {
  const [draft, setDraft] = useState("");
  const [provider, setProvider] = useState<"openai" | "fallback" | "">("");
  const [sources, setSources] = useState<AiDraftSource[]>([]);
  const [errorMessage, setErrorMessage] = useState("");
  const [copyMessage, setCopyMessage] = useState("");

  const [generateAiDraft, { isLoading: isGenerating }] =
    useGenerateAiDraftMutation();

  const [createMessage, { isLoading: isSending }] = useCreateMessageMutation();

  async function handleGenerateDraft() {
    setErrorMessage("");
    setCopyMessage("");

    try {
      const response = await generateAiDraft(ticketId).unwrap();

      setDraft(response.data.draft);
      setProvider(response.data.provider);
      setSources(response.data.sources);
    } catch (error) {
      console.error("Failed to generate AI draft:", error);
      setErrorMessage(
        "Failed to generate AI draft. Make sure you are logged in as owner, admin, or agent."
      );
    }
  }

  async function handleCopyDraft() {
    if (!draft.trim()) return;

    try {
      await navigator.clipboard.writeText(draft);
      setCopyMessage("Draft copied.");
    } catch (error) {
      console.error("Failed to copy draft:", error);
      setCopyMessage("Could not copy automatically. Please select and copy manually.");
    }
  }

  async function handleSendDraft() {
    const trimmedDraft = draft.trim();

    if (!trimmedDraft) return;

    const confirmed = window.confirm(
      "Send this AI draft as a public ticket message?"
    );

    if (!confirmed) return;

    try {
      await createMessage({
        ticketId,
        body: trimmedDraft
      }).unwrap();

      setCopyMessage("Draft sent as message.");
    } catch (error) {
      console.error("Failed to send draft:", error);
      setErrorMessage("Failed to send draft as message.");
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
      <h2>AI Draft Reply</h2>

      <p style={{ color: "#555" }}>
        Generate a suggested reply using the ticket details and matching
        knowledge-base chunks.
      </p>

      <button
        type="button"
        onClick={handleGenerateDraft}
        disabled={isGenerating}
      >
        {isGenerating ? "Generating..." : "Generate AI draft"}
      </button>

      {errorMessage && <p style={{ color: "red" }}>{errorMessage}</p>}

      {draft && (
        <div style={{ marginTop: "1rem" }}>
          <div
            style={{
              display: "flex",
              gap: "0.75rem",
              alignItems: "center",
              marginBottom: "0.75rem"
            }}
          >
            <strong>Provider:</strong>
            <span>{provider}</span>
          </div>

          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            rows={10}
            style={{
              width: "100%",
              padding: "0.75rem",
              resize: "vertical",
              marginBottom: "0.75rem"
            }}
          />

          <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
            <button type="button" onClick={handleCopyDraft}>
              Copy draft
            </button>

            <button
              type="button"
              onClick={handleSendDraft}
              disabled={isSending || !draft.trim()}
            >
              {isSending ? "Sending..." : "Send as message"}
            </button>
          </div>

          {copyMessage && <p>{copyMessage}</p>}
        </div>
      )}

      {sources.length > 0 && (
        <div style={{ marginTop: "1.5rem" }}>
          <h3>Sources used</h3>

          <div style={{ display: "grid", gap: "0.75rem" }}>
            {sources.map((source) => (
              <article
                key={source.chunkId}
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
                    marginBottom: "0.5rem"
                  }}
                >
                  <strong>{source.documentName}</strong>
                  <small>Score: {source.score}</small>
                </div>

                <small>Chunk #{source.chunkIndex + 1}</small>

                <p
                  style={{
                    whiteSpace: "pre-wrap",
                    marginBottom: 0,
                    marginTop: "0.5rem"
                  }}
                >
                  {source.content}
                </p>
              </article>
            ))}
          </div>
        </div>
      )}

      {draft && sources.length === 0 && (
        <p style={{ marginTop: "1rem", color: "#555" }}>
          No matching knowledge-base sources were found. The draft used the
          fallback ticket-only response.
        </p>
      )}
    </section>
  );
}