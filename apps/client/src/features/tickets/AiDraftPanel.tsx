import { useState } from "react";
import { useCreateMessageMutation } from "./messagesApi";
import {
  type AiDraftConfidence,
  type AiDraftSource,
  type AiDraftTone,
  useGenerateAiDraftMutation
} from "./aiApi";

type Props = {
  ticketId: string;
};

const tones: AiDraftTone[] = ["PROFESSIONAL", "FRIENDLY", "CONCISE"];

export function AiDraftPanel({ ticketId }: Props) {
  const [tone, setTone] = useState<AiDraftTone>("PROFESSIONAL");
  const [draft, setDraft] = useState("");
  const [provider, setProvider] = useState<"openai" | "fallback" | "">("");
  const [confidence, setConfidence] = useState<AiDraftConfidence | "">("");
  const [warnings, setWarnings] = useState<string[]>([]);
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
      const response = await generateAiDraft({
        ticketId,
        tone
      }).unwrap();

      setDraft(response.data.draft);
      setProvider(response.data.provider);
      setConfidence(response.data.confidence);
      setWarnings(response.data.warnings);
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
        Generate a suggested reply using ticket details and matching
        knowledge-base chunks.
      </p>

      <div
        style={{
          display: "flex",
          gap: "0.75rem",
          alignItems: "end",
          flexWrap: "wrap",
          marginBottom: "1rem"
        }}
      >
        <label>
          Tone
          <select
            value={tone}
            onChange={(event) => setTone(event.target.value as AiDraftTone)}
            style={{
              display: "block",
              padding: "0.6rem",
              marginTop: "0.4rem"
            }}
          >
            {tones.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>

        <button
          type="button"
          onClick={handleGenerateDraft}
          disabled={isGenerating}
        >
          {isGenerating ? "Generating..." : "Generate AI draft"}
        </button>
      </div>

      {errorMessage && <p style={{ color: "red" }}>{errorMessage}</p>}

      {draft && (
        <div style={{ marginTop: "1rem" }}>
          <div
            style={{
              display: "flex",
              gap: "1rem",
              flexWrap: "wrap",
              marginBottom: "0.75rem"
            }}
          >
            <span>
              <strong>Provider:</strong> {provider}
            </span>

            <span>
              <strong>Confidence:</strong> {confidence}
            </span>

            <span>
              <strong>Tone:</strong> {tone}
            </span>
          </div>

          {warnings.length > 0 && (
            <div
              style={{
                border: "1px solid #f0c36d",
                borderRadius: 8,
                padding: "0.75rem",
                marginBottom: "0.75rem",
                background: "#fff8e5"
              }}
            >
              <strong>Review warnings</strong>
              <ul>
                {warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </div>
          )}

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
          No matching knowledge-base sources were found. Review this draft
          carefully before sending.
        </p>
      )}
    </section>
  );
}