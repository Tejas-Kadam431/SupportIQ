import { useState } from "react";
import { useCreateMessageMutation } from "./messagesApi";
import {
  type AiDraftConfidence,
  type AiDraftGrounding,
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
  const [grounding, setGrounding] = useState<AiDraftGrounding | null>(null);
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
      setGrounding(response.data.grounding);
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
            <span className="siq-badge">Sources: {sources.length}</span>
            {grounding && (
              <span className={`siq-badge ${searchModeClass(grounding.searchMode)}`}>
                {formatLabel(grounding.searchMode)} search
              </span>
            )}
          </div>

          {grounding && (
            <div className="ai-grounding-panel">
              <div>
                <strong>Grounding check</strong>
                <p>
                  SupportIQ retrieved {grounding.sourceCount} knowledge-base
                  source{grounding.sourceCount === 1 ? "" : "s"} using{" "}
                  {formatLabel(grounding.searchMode)} search before generating
                  this draft.
                </p>
              </div>

              <div className="ai-grounding-query">
                <span>Search query</span>
                <code>{grounding.searchQuery}</code>
              </div>
            </div>
          )}

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
              <h3 className="siq-card-title">Grounding sources</h3>
              <p className="dashboard-card-subtitle">
                Internal citations showing which knowledge-base chunks informed
                this draft. These are shown to the agent, not automatically sent
                to the customer.
              </p>
            </div>
          </div>

          <div className="ai-source-list">
            {sources.map((source) => (
              <article key={source.chunkId} className="ai-source-card">
                <div className="ai-source-card-header ai-source-card-header-polished">
                  <div className="ai-source-title-row">
                    <span className="ai-source-citation">
                      {source.citationLabel}
                    </span>
                    <div>
                      <strong>{source.documentName}</strong>
                      <small>
                        Chunk #{source.chunkIndex + 1} ·{" "}
                        {formatLabel(source.searchType)} match
                      </small>
                    </div>
                  </div>

                  <span className="siq-badge">Score {formatScore(source.score)}</span>
                </div>

                <div className="ai-source-excerpt">
                  <span>Relevant excerpt</span>
                  <p>{source.excerpt}</p>
                </div>

                <details className="ai-source-details">
                  <summary>View full chunk</summary>
                  <p>{source.content}</p>
                </details>
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

function searchModeClass(searchMode: AiDraftGrounding["searchMode"]) {
  if (searchMode === "semantic") return "siq-badge-purple";
  return "siq-badge-slate";
}

function formatScore(score: number) {
  if (Number.isInteger(score)) {
    return score;
  }

  return score.toFixed(2);
}

function formatLabel(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(" ");
}