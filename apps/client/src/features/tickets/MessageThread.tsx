import { useState } from "react";
import { useAppSelector } from "../../app/hooks";
import {
  useCreateMessageMutation,
  useListMessagesQuery
} from "./messagesApi";

type Props = {
  ticketId: string;
};

export function MessageThread({ ticketId }: Props) {
  const user = useAppSelector((state) => state.auth.user);
  const [body, setBody] = useState("");

  const {
    data,
    isLoading,
    isError
  } = useListMessagesQuery(ticketId);

  const [createMessage, { isLoading: isSending }] = useCreateMessageMutation();

  const messages = data?.data.messages ?? [];

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedBody = body.trim();

    if (!trimmedBody) return;

    try {
      await createMessage({
        ticketId,
        body: trimmedBody
      }).unwrap();

      setBody("");
    } catch (error) {
      console.error("Failed to send message:", error);
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
      <h2>Messages</h2>

      {isLoading && <p>Loading messages...</p>}

      {isError && (
        <p style={{ color: "red" }}>Failed to load messages.</p>
      )}

      {!isLoading && messages.length === 0 && (
        <p>No messages yet. Start the conversation.</p>
      )}

      <div style={{ display: "grid", gap: "0.75rem", marginBottom: "1rem" }}>
        {messages.map((message) => {
          const isMine = message.senderId === user?.id;

          return (
            <article
              key={message.id}
              style={{
                border: "1px solid #eee",
                borderRadius: 8,
                padding: "0.75rem",
                background: isMine ? "#f8f8f8" : "white"
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
                <strong>{message.sender.name}</strong>
                <small>{new Date(message.createdAt).toLocaleString()}</small>
              </div>

              <p style={{ whiteSpace: "pre-wrap", margin: 0 }}>
                {message.body}
              </p>
            </article>
          );
        })}
      </div>

      <form onSubmit={handleSubmit}>
        <textarea
          value={body}
          onChange={(event) => setBody(event.target.value)}
          placeholder="Write a reply..."
          rows={4}
          style={{
            width: "100%",
            padding: "0.75rem",
            resize: "vertical",
            marginBottom: "0.75rem"
          }}
        />

        <button type="submit" disabled={isSending || !body.trim()}>
          {isSending ? "Sending..." : "Send message"}
        </button>
      </form>
    </section>
  );
}