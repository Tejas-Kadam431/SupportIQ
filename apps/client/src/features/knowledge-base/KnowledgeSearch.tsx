import { useState } from "react";
import { useSearchKnowledgeBaseQuery } from "./kbApi";

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
    <section
      style={{
        border: "1px solid #ddd",
        borderRadius: 8,
        padding: "1rem"
      }}
    >
      <h2>Search knowledge base</h2>

      <form
        onSubmit={handleSubmit}
        style={{
          display: "flex",
          gap: "0.75rem",
          marginBottom: "1rem"
        }}
      >
        <input
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
          placeholder="Search uploaded documents..."
          style={{ padding: "0.7rem", flex: 1 }}
        />

        <button type="submit" disabled={!searchInput.trim() || isFetching}>
          {isFetching ? "Searching..." : "Search"}
        </button>
      </form>

      {isError && <p style={{ color: "red" }}>Search failed.</p>}

      {submittedQuery && !isFetching && !isError && results.length === 0 && (
        <p>No results found for “{submittedQuery}”.</p>
      )}

      <div style={{ display: "grid", gap: "0.75rem" }}>
        {results.map((result) => (
          <article
            key={result.id}
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
              <strong>{result.document.originalName}</strong>
              <small>Score: {result.score}</small>
            </div>

            <p style={{ whiteSpace: "pre-wrap", marginBottom: "0.5rem" }}>
              {result.content}
            </p>

            <small>
              Chunk #{result.chunkIndex + 1} · Estimated tokens:{" "}
              {result.tokenCount}
            </small>
          </article>
        ))}
      </div>
    </section>
  );
}