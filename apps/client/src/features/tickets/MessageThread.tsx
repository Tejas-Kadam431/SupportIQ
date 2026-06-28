import { useCallback, useState } from "react";
import { useAppSelector } from "../../app/hooks";
import {
  useCreateMessageMutation,
  useListMessagesQuery
} from "./messagesApi";
import { useTicketRealtime } from "../realtime/useTicketRealtime";
import "./tickets.css";
import { getApiErrorMessage } from "../../utils/getApiErrorMessage";
type Props = {
  ticketId: string;
};

export function MessageThread({ ticketId }: Props) {
  const user = useAppSelector((state) => state.auth.user);
  const [body, setBody] = useState("");
  const [sendError, setSendError] = useState("");

  const {
    data,
    isLoading,
    isError,
    refetch
  } = useListMessagesQuery(ticketId);

  const handleRealtimeMessage = useCallback(() => {
    void refetch();
  }, [refetch]);

  useTicketRealtime({
    ticketId,
    onMessageCreated: handleRealtimeMessage
  });

  const [createMessage, { isLoading: isSending }] = useCreateMessageMutation();

  const messages = data?.data.messages ?? [];

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedBody = body.trim();

    if (!trimmedBody) return;
    setSendError("");
    try {
      await createMessage({
        ticketId,
        body: trimmedBody
      }).unwrap();

      setBody("");
    } catch (error) {
      console.error("Failed to send message:", error);
      setSendError(
        getApiErrorMessage(error, "Failed to send message. Please try again.")
      );
    }
  }

  return (
    <section className="siq-card message-thread-card">
      <div className="siq-card-header">
        <div>
          <h2 className="siq-card-title">Messages</h2>
          <p className="dashboard-card-subtitle">
            Public customer-agent conversation with real-time updates.
          </p>
        </div>

        <span className="siq-badge siq-badge-blue">Live</span>
      </div>

      {isLoading && <div className="ticket-loading">Loading messages...</div>}

      {isError && (
        <div className="ticket-alert ticket-alert-error">Failed to load messages.</div>
      )}

      {!isLoading && messages.length === 0 && (
        <div className="ticket-empty-state">
          No messages yet. Start the conversation.
        </div>
      )}

      <div className="message-list">
        {messages.map((message) => {
          const isMine = message.senderId === user?.id;

          return (
            <article
              key={message.id}
              className={isMine ? "message-card message-card-mine" : "message-card"}
            >
              <div className="message-card-header">
                <div className="message-author">
                  <div className="message-avatar">
                    {(message.sender.name[0] ?? "U").toUpperCase()}
                  </div>

                  <div>
                    <strong>{message.sender.name}</strong>
                    <span>{message.sender.email}</span>
                  </div>
                </div>

                <small>{new Date(message.createdAt).toLocaleString()}</small>
              </div>

              <p>{message.body}</p>
            </article>
          );
        })}
      </div>
      {sendError && (
        <div className="ticket-alert ticket-alert-error">{sendError}</div>
      )}
      <form onSubmit={handleSubmit} className="message-composer">
        <textarea
          value={body}
          onChange={(event) => {
            setBody(event.target.value);
            setSendError("");
          }}
          placeholder="Write a reply..."
          rows={4}
        />

        <button
          type="submit"
          className="siq-button siq-button-primary"
          disabled={isSending || !body.trim()}
        >
          {isSending ? "Sending..." : "Send message"}
        </button>
      </form>
    </section>
  );
}