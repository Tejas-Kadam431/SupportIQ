import { useEffect } from "react";
import { useAppSelector } from "../../app/hooks";
import {
  getSocket,
  type TicketMessageCreatedPayload
} from "./socketClient";

type UseTicketRealtimeArgs = {
  ticketId: string | undefined;
  onMessageCreated?: (payload: TicketMessageCreatedPayload) => void;
};

export function useTicketRealtime({
  ticketId,
  onMessageCreated
}: UseTicketRealtimeArgs) {
  const accessToken = useAppSelector((state) => state.auth.accessToken);

  useEffect(() => {
    if (!ticketId || !accessToken) return;

    const activeTicketId = ticketId;
    const socket = getSocket(accessToken);

    function joinTicketRoom() {
      socket.emit("ticket:join", { ticketId: activeTicketId }, (response) => {
        if (!response?.ok) {
          console.error(
            "Failed to join ticket room:",
            response?.error ?? "Unknown error"
          );
        }
      });
    }

    function handleConnect() {
      joinTicketRoom();
    }

    function handleConnectError(error: Error) {
      console.error("Socket connection error:", error.message);
    }

    function handleMessageCreated(payload: TicketMessageCreatedPayload) {
      if (payload.ticketId !== activeTicketId) return;

      onMessageCreated?.(payload);
    }

    socket.on("connect", handleConnect);
    socket.on("connect_error", handleConnectError);
    socket.on("ticket:message_created", handleMessageCreated);

    if (!socket.connected) {
      socket.connect();
    } else {
      joinTicketRoom();
    }

    return () => {
      socket.off("connect", handleConnect);
      socket.off("connect_error", handleConnectError);
      socket.off("ticket:message_created", handleMessageCreated);

      if (socket.connected) {
        socket.emit("ticket:leave", { ticketId: activeTicketId });
      }
    };
  }, [accessToken, ticketId, onMessageCreated]);
}