import { useState } from "react";
import { useSearchKnowledgeBaseQuery } from "./kbApi";
import "./kb.css";

type Props = {
  orgId: string;
};

export function KnowledgeSearch({ orgId }: Props) {
  const [searchInput, setSearchInput] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");

  const {
    data,
    isFetching,
    isError
  } = useSearchKnowledgeBaseQuery(
    {
      orgId,
      q: submittedQuery,
      limit: 10
    },
    {
      skip: !submittedQuery.trim()
    }
  );

  const results = data?.data.results ?? [];

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmed = searchInput.trim();

    if (!trimmed) return;

    setSubmittedQuery(trimmed);
  }

  return (
    <section className="siq-card kb-search-card">
      <div className="kb-card-header">
        <div>
          <div className="kb-search-icon">⌕</div>
          <h2>Search knowledge</h2>
          <p>
            Test whether uploaded documents are searchable before relying on them
            in AI replies.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="kb-search-form">
        <input
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
          placeholder="Example: refund policy, billing issue, onboarding steps..."
        />

        <button
          type="submit"
          className="siq-button siq-button-primary"
          disabled={!searchInput.trim() || isFetching}
        >
          {isFetching ? "Searching..." : "Search"}
        </button>
      </form>

      {isError && <div className="kb-alert kb-alert-error">Search failed.</div>}

      {!submittedQuery && (
        <div className="kb-search-empty">
          <strong>No search yet</strong>
          <p>Enter a question or keyword to test knowledge retrieval.</p>
        </div>
      )}

      {submittedQuery && !isFetching && !isError && results.length === 0 && (
        <div className="kb-search-empty">
          <strong>No results found</strong>
          <p>No chunks matched “{submittedQuery}”.</p>
        </div>
      )}

      {results.length > 0 && (
        <div className="kb-search-results">
          <div className="kb-result-summary">
            <strong>{results.length} results</strong>
            <span>for “{submittedQuery}”</span>
          </div>

          {results.map((result) => (
            <article key={result.id} className="kb-result-card">
              <div className="kb-result-header">
                <div>
                  <strong>{result.document.originalName}</strong>
                  <small>
                    Chunk #{result.chunkIndex + 1} · Estimated tokens:{" "}
                    {result.tokenCount}
                  </small>
                </div>

                <span className="siq-badge siq-badge-blue">
                  Score {formatScore(result.score)}
                </span>
              </div>

              <p>{result.content}</p>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function formatScore(score: number) {
  if (Number.isInteger(score)) return String(score);
  return score.toFixed(2);
}