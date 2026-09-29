import { useState, useRef } from "react";
import {
  type AiDraftConfidence,
  type AiDraftGrounding,
  type AiDraftSource,
  type AiDraftTone,
  type AiProvider,
  type CopilotFailureReason,
  useEvaluateCopilotMutation,
  useSendCopilotMutation,
  useGenerateAiDraftMutation
} from "./aiApi";
import { getApiErrorMessage } from "../../utils/getApiErrorMessage";
import "./tickets.css";

type Props = {
  ticketId: string;
};

const tones: AiDraftTone[] = [
  "PROFESSIONAL",
  "FRIENDLY",
  "CONCISE"
];

const rejectionReasons: CopilotFailureReason[] = [
  "WRONG_KNOWLEDGE",
  "MISSING_CUSTOMER_CONTEXT",
  "INSUFFICIENT_KB",
  "IRRELEVANT_EVIDENCE",
  "INCORRECT_RECOMMENDATION",
  "INCOMPLETE_RESPONSE",
  "BAD_TONE",
  "UNSUPPORTED_CLAIM",
  "OTHER"
];

export function AiDraftPanel(props: Props) {
  return <AiDraftPanelContent key={props.ticketId} {...props} />;
}

function AiDraftPanelContent({ ticketId }: Props) {
  const [terminal, setTerminal] = useState(false);
  const submitting = useRef(false);
  const [tone, setTone] =
    useState<AiDraftTone>("PROFESSIONAL");

  const [draft, setDraft] = useState("");

  const [provider, setProvider] =
    useState<AiProvider | "">("");

  const [confidence, setConfidence] =
    useState<AiDraftConfidence | "">("");

  const [warnings, setWarnings] =
    useState<string[]>([]);

  const [sources, setSources] =
    useState<AiDraftSource[]>([]);

  const [grounding, setGrounding] =
    useState<AiDraftGrounding | null>(null);

  const [errorMessage, setErrorMessage] =
    useState("");

  const [copyMessage, setCopyMessage] =
    useState("");

  // -----------------------------
  // Copilot state
  // -----------------------------

  const [runId, setRunId] =
    useState<string | null>(null);

  const [topic, setTopic] =
    useState("");

  const [issueSummary, setIssueSummary] =
    useState("");

  const [
    missingInformation,
    setMissingInformation
  ] = useState<string[]>([]);

  const [
    recommendedAction,
    setRecommendedAction
  ] = useState("");

  const [abstained, setAbstained] =
    useState(false);


  const [
    rejectionReason,
    setRejectionReason
  ] = useState<CopilotFailureReason>(
    "INSUFFICIENT_KB"
  );

  const [
    feedbackMessage,
    setFeedbackMessage
  ] = useState("");

  // -----------------------------
  // API mutations
  // -----------------------------

  const [
    generateAiDraft,
    { isLoading: isGenerating }
  ] = useGenerateAiDraftMutation();

  const [
    evaluateCopilot,
    { isLoading: isEvaluating }
  ] = useEvaluateCopilotMutation();

  const [
    sendCopilot,
    { isLoading: isSending }
  ] = useSendCopilotMutation();

  // -----------------------------
  // Generate Copilot run
  // -----------------------------

  async function handleGenerateDraft() {
    setErrorMessage("");
    setCopyMessage("");
    setFeedbackMessage("");

    try {
      const response = await generateAiDraft({
        ticketId,
        tone
      }).unwrap();

      const suggestedReply =
        response.data.suggestedReply ?? "";

      setRunId(response.data.runId);
      setTerminal(false);

      setTopic(response.data.topic);

      setIssueSummary(
        response.data.issueSummary
      );

      setMissingInformation(
        response.data.missingInformation
      );

      setRecommendedAction(
        response.data.recommendedAction
      );

      setAbstained(
        response.data.abstained
      );

      setDraft(suggestedReply);


      setProvider(
        response.data.provider
      );

      setConfidence(
        response.data.confidence
      );

      setWarnings(
        response.data.warnings
      );

      setSources(
        response.data.sources
      );

      setGrounding(
        response.data.grounding
      );
    } catch (error) {
      console.error(
        "Failed to generate AI Copilot response:",
        error
      );

      setErrorMessage(
        getApiErrorMessage(
          error,
          "Failed to generate AI Copilot response. Make sure you are logged in as owner, admin, or agent."
        )
      );
    }
  }

  // -----------------------------
  // Copy
  // -----------------------------

  async function handleCopyDraft() {
    if (!draft.trim()) {
      return;
    }

    try {
      await navigator.clipboard.writeText(
        draft
      );

      setCopyMessage(
        "Suggested reply copied."
      );
    } catch (error) {
      console.error(
        "Failed to copy suggested reply:",
        error
      );

      setCopyMessage(
        "Could not copy automatically. Please select and copy manually."
      );
    }
  }

  // -----------------------------
  // Send + automatically evaluate
  // -----------------------------

  async function handleSendDraft() {
    if (!runId || !draft.trim() || abstained || terminal || submitting.current) return;
    if (!window.confirm("Send this Copilot suggestion as a public ticket message?")) return;
    submitting.current = true;
    setErrorMessage(""); setCopyMessage(""); setFeedbackMessage("");
    try {
      const response = await sendCopilot({ ticketId, runId, finalMessage: draft }).unwrap();
      setTerminal(true);
      setCopyMessage("Reply sent as a public message.");
      setFeedbackMessage(response.data.evaluation.disposition === "ACCEPTED"
        ? "Copilot suggestion accepted. Feedback recorded."
        : "Edited Copilot response recorded for AI quality analysis.");
    } catch (error) {
      if (typeof error === "object" && error !== null && "status" in error && error.status === 409) setTerminal(true);
      setErrorMessage(getApiErrorMessage(error, "Send could not be confirmed. Retry the same reply to check safely."));
    } finally { submitting.current = false; }
  }

  // -----------------------------
  // Reject
  // -----------------------------

  async function handleRejectCopilot() {
    if (!runId || terminal || submitting.current) {
      return;
    }

    submitting.current = true;
    setErrorMessage("");
    setFeedbackMessage("");

    try {
      await evaluateCopilot({
        ticketId,
        runId,
        disposition: "REJECTED",
        reason: rejectionReason
      }).unwrap();

      setTerminal(true);
      setFeedbackMessage(
        `Copilot suggestion rejected: ${formatLabel(
          rejectionReason
        )}.`
      );
    } catch (error) {
      if (typeof error === "object" && error !== null && "status" in error && error.status === 409) setTerminal(true);

      setErrorMessage(
        getApiErrorMessage(
          error,
          "Failed to save Copilot feedback."
        )
      );
    } finally { submitting.current = false; }
  }

  const hasCopilotResult =
    Boolean(issueSummary) ||
    Boolean(grounding);

  return (
    <section className="siq-card ai-draft-card">
      {/* HEADER */}

      <div className="ai-draft-header">
        <div>
          <div className="ai-draft-icon">
            ✦
          </div>

          <h2>AI Support Copilot</h2>

          <p>
            Analyze the issue, surface missing
            context, recommend the next action,
            retrieve supporting knowledge, and
            suggest a grounded response.
          </p>
        </div>

        {confidence && (
          <span
            className={`siq-badge ${confidenceClass(
              confidence
            )}`}
          >
            Evidence: {confidence === "HIGH" ? "Strong" : confidence === "MEDIUM" ? "Limited" : "Insufficient"}
          </span>
        )}
      </div>

      {/* CONTROLS */}

      <div className="ai-draft-controls">
        <div className="ticket-field">
          <label htmlFor="ai-tone">
            Tone
          </label>

          <select
            id="ai-tone"
            value={tone}
            onChange={(event) =>
              setTone(
                event.target
                  .value as AiDraftTone
              )
            }
          >
            {tones.map((item) => (
              <option
                key={item}
                value={item}
              >
                {formatLabel(item)}
              </option>
            ))}
          </select>
        </div>

        <button
          type="button"
          className="siq-button siq-button-primary"
          onClick={handleGenerateDraft}
          disabled={isGenerating || isSending || isEvaluating}
        >
          {isGenerating
            ? "Analyzing..."
            : "Run AI Copilot"}
        </button>
      </div>

      {/* ERROR */}

      {errorMessage && (
        <div className="ticket-alert ticket-alert-error">
          {errorMessage}
        </div>
      )}

      {/* COPILOT RESULT */}

      {hasCopilotResult ? (
        <div className="ai-draft-result">
          {/* META */}

          <div className="ai-draft-meta">
            <span className="siq-badge siq-badge-blue">
              Provider:{" "}
              {provider || "unknown"}
            </span>

            <span className="siq-badge">
              Tone: {formatLabel(tone)}
            </span>

            <span className="siq-badge">
              Sources: {sources.length}
            </span>

            {topic && (
              <span className="siq-badge siq-badge-purple">
                Topic: {topic}
              </span>
            )}

            {grounding && (
              <span
                className={`siq-badge ${searchModeClass(
                  grounding.searchMode
                )}`}
              >
                {formatLabel(
                  grounding.searchMode
                )}{" "}
                search
              </span>
            )}
          </div>

          {/* COPILOT ANALYSIS */}

          <div className="ai-grounding-panel">
            <div>
              <strong>
                Issue summary
              </strong>

              <p>{issueSummary}</p>
            </div>

            <div>
              <strong>
                Recommended next action
              </strong>

              <p>
                {recommendedAction}
              </p>
            </div>
          </div>

          {/* MISSING INFORMATION */}

          {missingInformation.length >
            0 && (
            <div className="ai-warning-box">
              <strong>
                Missing information
              </strong>

              <ul>
                {missingInformation.map(
                  (item) => (
                    <li key={item}>
                      {item}
                    </li>
                  )
                )}
              </ul>
            </div>
          )}

          {/* GROUNDING */}

          {grounding && (
            <div className="ai-grounding-panel">
              <div>
                <strong>
                  Grounding check
                </strong>

                <p>
                  SupportIQ retrieved{" "}
                  {
                    grounding.sourceCount
                  }{" "}
                  knowledge-base source
                  {grounding.sourceCount ===
                  1
                    ? ""
                    : "s"}{" "}
                  using{" "}
                  {formatLabel(
                    grounding.searchMode
                  )}{" "}
                  search.
                </p>
              </div>

              <div className="ai-grounding-query">
                <span>
                  Search query
                </span>

                <code>
                  {
                    grounding.searchQuery
                  }
                </code>
              </div>
            </div>
          )}

          {/* WARNINGS */}

          {warnings.length > 0 && (
            <div className="ai-warning-box">
              <strong>
                Review warnings
              </strong>

              <ul>
                {warnings.map(
                  (warning) => (
                    <li key={warning}>
                      {warning}
                    </li>
                  )
                )}
              </ul>
            </div>
          )}

          {/* ABSTENTION OR REPLY */}

          {abstained ? (
            <div className="ai-warning-box">
              <strong>
                Reply needs agent review
              </strong>

              <p>
                {recommendedAction}
              </p>

              <p>
                Review the missing
                information and knowledge
                sources before responding
                to the customer.
              </p>
            </div>
          ) : (
            <>
              <div className="ticket-field">
                <label htmlFor="copilot-reply">
                  Suggested customer reply
                </label>

                <textarea
                  id="copilot-reply"
                  className="ai-draft-textarea"
                  disabled={terminal || isSending || isEvaluating}
                  value={draft}
                  onChange={(event) =>
                    setDraft(
                      event.target.value
                    )
                  }
                  rows={9}
                />
              </div>

              <div className="ai-draft-actions">
                <button
                  type="button"
                  className="siq-button"
                  onClick={
                    handleCopyDraft
                  }
                  disabled={
                    !draft.trim()
                  }
                >
                  Copy reply
                </button>

                <button
                  type="button"
                  className="siq-button siq-button-primary"
                  onClick={
                    handleSendDraft
                  }
                  disabled={
                    !runId || terminal || isGenerating || isSending ||
                    isEvaluating ||
                    !draft.trim()
                  }
                >
                  {isSending
                    ? "Sending..."
                    : "Send as message"}
                </button>
              </div>
            </>
          )}

          {/* AGENT FEEDBACK */}

          {runId && (
            <div className="ai-grounding-panel">
              <div>
                <strong>
                  AI quality feedback
                </strong>

                <p>
                  Sending the suggested
                  reply automatically
                  records it as accepted
                  or edited. Reject the
                  Copilot run here when
                  the recommendation
                  should not be used.
                </p>
              </div>

              <div className="ticket-field">
                <label htmlFor="copilot-rejection">
                  Rejection reason
                </label>

                <select
                  id="copilot-rejection"
                  value={
                    rejectionReason
                  }
                  onChange={(event) =>
                    setRejectionReason(
                      event.target
                        .value as CopilotFailureReason
                    )
                  }
                >
                  {rejectionReasons.map(
                    (reason) => (
                      <option
                        key={reason}
                        value={reason}
                      >
                        {formatLabel(
                          reason
                        )}
                      </option>
                    )
                  )}
                </select>

                <button
                  type="button"
                  className="siq-button"
                  disabled={terminal || isGenerating || isSending || isEvaluating}
                  onClick={
                    handleRejectCopilot
                  }
                >
                  {isEvaluating
                    ? "Saving..."
                    : "Reject Copilot suggestion"}
                </button>
              </div>
            </div>
          )}

          {copyMessage && (
            <p className="ai-copy-message">
              {copyMessage}
            </p>
          )}

          {feedbackMessage && (
            <p className="ai-copy-message">
              {feedbackMessage}
            </p>
          )}
        </div>
      ) : (
        <div className="ai-draft-empty">
          <strong>
            No Copilot analysis yet
          </strong>

          <p>
            Choose a tone and run the AI
            Copilot when you are ready to
            analyze this ticket.
          </p>
        </div>
      )}

      {/* SOURCES */}

      {sources.length > 0 && (
        <div className="ai-sources-section">
          <div className="siq-card-header">
            <div>
              <h3 className="siq-card-title">
                Grounding sources
              </h3>

              <p className="dashboard-card-subtitle">
                Internal evidence showing
                which knowledge-base
                chunks informed this
                Copilot run. These
                sources are visible to
                staff and are not sent to
                the customer.
              </p>
            </div>
          </div>

          <div className="ai-source-list">
            {sources.map((source) => (
              <article
                key={source.chunkId}
                className="ai-source-card"
              >
                <div className="ai-source-card-header ai-source-card-header-polished">
                  <div className="ai-source-title-row">
                    <span className="ai-source-citation">
                      {
                        source.citationLabel
                      }
                    </span>

                    <div>
                      <strong>
                        {
                          source.documentName
                        }{source.versionNumber ? ` · v${source.versionNumber}` : ""}
                      </strong>

                      <small>
                        Chunk #
                        {source.chunkIndex +
                          1}{" "}
                        ·{" "}
                        {formatLabel(
                          source.searchType
                        )}{" "}
                        match
                      </small>
                    </div>
                  </div>

                  <span className="siq-badge">
                    Selected source
                  </span>
                </div>

                <div className="ai-source-excerpt">
                  <span>
                    Relevant excerpt
                  </span>

                  <p>
                    {source.excerpt}
                  </p>
                </div>

                <details className="ai-source-details">
                  <summary>
                    View full chunk
                  </summary>

                  <p>
                    {source.content}
                  </p>
                </details>
              </article>
            ))}
          </div>
        </div>
      )}

      {/* NO SOURCES */}

      {hasCopilotResult &&
        sources.length === 0 && (
          <div className="ai-no-sources">
            No matching knowledge-base
            sources were found. Copilot
            should avoid making
            unsupported claims and may
            abstain from suggesting a
            final reply.
          </div>
        )}
    </section>
  );
}

function confidenceClass(
  confidence: AiDraftConfidence
) {
  if (confidence === "HIGH") {
    return "siq-badge-green";
  }

  if (confidence === "MEDIUM") {
    return "siq-badge-orange";
  }

  return "siq-badge-red";
}

function searchModeClass(
  searchMode: AiDraftGrounding["searchMode"]
) {
  if (searchMode === "semantic") {
    return "siq-badge-purple";
  }

  return "siq-badge-slate";
}

function formatLabel(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map(
      (part) =>
        part[0].toUpperCase() +
        part.slice(1)
    )
    .join(" ");
}