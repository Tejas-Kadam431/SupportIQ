import { useState } from "react";
import {
  useCreateNoteMutation,
  useListNotesQuery
} from "./notesApi";

type Props = {
  ticketId: string;
};

export function InternalNotes({ ticketId }: Props) {
  const [body, setBody] = useState("");

  const {
    data,
    isLoading,
    isError
  } = useListNotesQuery(ticketId);

  const [createNote, { isLoading: isAdding }] = useCreateNoteMutation();

  const notes = data?.data.notes ?? [];

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedBody = body.trim();

    if (!trimmedBody) return;

    try {
      await createNote({
        ticketId,
        body: trimmedBody
      }).unwrap();

      setBody("");
    } catch (error) {
      console.error("Failed to add internal note:", error);
    }
  }

  return (
    <section
      style={{
        border: "1px solid #ddd",
        borderRadius: 8,
        padding: "1rem"
      }}
    >
      <h2>Internal Notes</h2>
      <p style={{ fontSize: "0.9rem", color: "#555" }}>
        Notes are visible only to support staff.
      </p>

      {isLoading && <p>Loading notes...</p>}

      {isError && (
        <p style={{ color: "red" }}>
          Internal notes are unavailable for this user.
        </p>
      )}

      {!isLoading && !isError && notes.length === 0 && (
        <p>No internal notes yet.</p>
      )}

      <div style={{ display: "grid", gap: "0.75rem", marginBottom: "1rem" }}>
        {notes.map((note) => (
          <article
            key={note.id}
            style={{
              border: "1px solid #eee",
              borderRadius: 8,
              padding: "0.75rem",
              background: "#fffdf5"
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
              <strong>{note.author.name}</strong>
              <small>{new Date(note.createdAt).toLocaleString()}</small>
            </div>

            <p style={{ whiteSpace: "pre-wrap", margin: 0 }}>
              {note.body}
            </p>
          </article>
        ))}
      </div>

      {!isError && (
        <form onSubmit={handleSubmit}>
          <textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            placeholder="Add an internal note..."
            rows={4}
            style={{
              width: "100%",
              padding: "0.75rem",
              resize: "vertical",
              marginBottom: "0.75rem"
            }}
          />

          <button type="submit" disabled={isAdding || !body.trim()}>
            {isAdding ? "Adding..." : "Add note"}
          </button>
        </form>
      )}
    </section>
  );
}