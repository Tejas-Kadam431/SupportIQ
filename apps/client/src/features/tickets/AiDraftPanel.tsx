import { useState } from "react";
import { useCreateMessageMutation } from "./messagesApi";
import {
  type AiDraftConfidence,
  type AiDraftSource,
  type AiDraftTone,
  useGenerateAiDraftMutation
} from "./aiApi";
import "./tickets.css";

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
    <section className="siq-card ai-draft-card">
      <div className="ai-draft-header">
        <div>
          <div className="ai-draft-icon">✦</div>
          <h2>AI Draft Reply</h2>
          <p>
            Generate a source-grounded support reply using ticket context and
            matching knowledge-base chunks.
          </p>
        </div>

        {confidence && (
          <span className={`siq-badge ${confidenceClass(confidence)}`}>
            {confidence} confidence
          </span>
        )}
      </div>

      <div className="ai-draft-controls">
        <div className="ticket-field">
          <label htmlFor="ai-tone">Tone</label>
          <select
            id="ai-tone"
            value={tone}
            onChange={(event) => setTone(event.target.value as AiDraftTone)}
          >
            {tones.map((item) => (
              <option key={item} value={item}>
                {formatLabel(item)}
              </option>
            ))}
          </select>
        </div>

        <button
          type="button"
          className="siq-button siq-button-primary"
          onClick={handleGenerateDraft}
          disabled={isGenerating}
        >
          {isGenerating ? "Generating..." : "Generate AI draft"}
        </button>
      </div>

      {errorMessage && (
        <div className="ticket-alert ticket-alert-error">{errorMessage}</div>
      )}

      {draft ? (
        <div className="ai-draft-result">
          <div className="ai-draft-meta">
            <span className="siq-badge siq-badge-blue">
              Provider: {provider || "unknown"}
            </span>
            <span className="siq-badge">Tone: {formatLabel(tone)}</span>
            <span className="siq-badge">
              Sources: {sources.length}
            </span>
          </div>

          {warnings.length > 0 && (
            <div className="ai-warning-box">
              <strong>Review warnings</strong>
              <ul>
                {warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </div>
          )}

          <textarea
            className="ai-draft-textarea"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            rows={9}
          />

          <div className="ai-draft-actions">
            <button type="button" className="siq-button" onClick={handleCopyDraft}>
              Copy draft
            </button>

            <button
              type="button"
              className="siq-button siq-button-primary"
              onClick={handleSendDraft}
              disabled={isSending || !draft.trim()}
            >
              {isSending ? "Sending..." : "Send as message"}
            </button>
          </div>

          {copyMessage && <p className="ai-copy-message">{copyMessage}</p>}
        </div>
      ) : (
        <div className="ai-draft-empty">
          <strong>No draft generated yet</strong>
          <p>
            Choose a tone and generate a draft when you are ready to respond.
          </p>
        </div>
      )}

      {sources.length > 0 && (
        <div className="ai-sources-section">
          <div className="siq-card-header">
            <div>
              <h3 className="siq-card-title">Sources used</h3>
              <p className="dashboard-card-subtitle">
                Knowledge-base chunks used to ground this draft.
              </p>
            </div>
          </div>

          <div className="ai-source-list">
            {sources.map((source) => (
              <article key={source.chunkId} className="ai-source-card">
                <div className="ai-source-card-header">
                  <strong>{source.documentName}</strong>
                  <span className="siq-badge">Score {source.score}</span>
                </div>

                <small>Chunk #{source.chunkIndex + 1}</small>

                <p>{source.content}</p>
              </article>
            ))}
          </div>
        </div>
      )}

      {draft && sources.length === 0 && (
        <div className="ai-no-sources">
          No matching knowledge-base sources were found. Review this draft
          carefully before sending.
        </div>
      )}
    </section>
  );
}

function confidenceClass(confidence: AiDraftConfidence) {
  if (confidence === "HIGH") return "siq-badge-green";
  if (confidence === "MEDIUM") return "siq-badge-orange";
  return "siq-badge-red";
}

function formatLabel(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(" ");
}