import { useState } from "react";
import {
  useCreateNoteMutation,
  useListNotesQuery
} from "./notesApi";
import { getApiErrorMessage } from "../../utils/getApiErrorMessage";
import "./tickets.css";

type Props = {
  ticketId: string;
};

export function InternalNotes({ ticketId }: Props) {
  const [body, setBody] = useState("");
  const [noteError, setNoteError] = useState("");

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

    setNoteError("");

    try {
      await createNote({
        ticketId,
        body: trimmedBody
      }).unwrap();

      setBody("");
    } catch (error) {
      console.error("Failed to add internal note:", error);
      setNoteError(
        getApiErrorMessage(error, "Failed to add internal note. Please try again.")
      );
    }
  }

  return (
    <section className="siq-card internal-notes-card">
      <div className="siq-card-header">
        <div>
          <h2 className="siq-card-title">Internal Notes</h2>
          <p className="dashboard-card-subtitle">
            Private notes visible only to support staff.
          </p>
        </div>

        <span className="siq-badge siq-badge-orange">Staff only</span>
      </div>

      {isLoading && <div className="ticket-loading">Loading notes...</div>}

      {isError && (
        <div className="ticket-alert ticket-alert-error">
          Internal notes are unavailable for this user.
        </div>
      )}

      {noteError && (
        <div className="ticket-alert ticket-alert-error">{noteError}</div>
      )}

      {!isLoading && !isError && notes.length === 0 && (
        <div className="ticket-empty-state">No internal notes yet.</div>
      )}

      <div className="internal-note-list">
        {notes.map((note) => (
          <article key={note.id} className="internal-note-card">
            <div className="internal-note-header">
              <div className="message-author">
                <div className="message-avatar internal-note-avatar">
                  {(note.author.name[0] ?? "U").toUpperCase()}
                </div>

                <div>
                  <strong>{note.author.name}</strong>
                  <span>{note.author.email}</span>
                </div>
              </div>

              <small>{new Date(note.createdAt).toLocaleString()}</small>
            </div>

            <p>{note.body}</p>
          </article>
        ))}
      </div>

      {!isError && (
        <form onSubmit={handleSubmit} className="internal-note-form">
          <textarea
            value={body}
            onChange={(event) => {
              setBody(event.target.value);
              setNoteError("");
            }}
            placeholder="Add an internal note..."
            rows={4}
          />

          <button
            type="submit"
            className="siq-button siq-button-primary"
            disabled={isAdding || !body.trim()}
          >
            {isAdding ? "Adding..." : "Add note"}
          </button>
        </form>
      )}
    </section>
  );
}