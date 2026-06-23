import { io, type Socket } from "socket.io-client";

export type TicketMessageCreatedPayload = {
  ticketId: string;
  message: {
    id: string;
    ticketId: string;
    senderId: string;
    body: string;
    createdAt: string;
    sender: {
      id: string;
      name: string;
      email: string;
      avatarUrl: string | null;
    };
  };
};

type ServerToClientEvents = {
  "ticket:message_created": (payload: TicketMessageCreatedPayload) => void;
};

type ClientToServerEvents = {
  "ticket:join": (
    payload: { ticketId: string },
    callback?: (response: { ok: boolean; error?: string }) => void
  ) => void;

  "ticket:leave": (
    payload: { ticketId: string },
    callback?: (response: { ok: boolean; error?: string }) => void
  ) => void;
};

export type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let socket: AppSocket | null = null;
let currentToken: string | null = null;

const socketUrl = import.meta.env.VITE_SOCKET_URL ?? "http://localhost:4000";

export function getSocket(accessToken: string) {
  if (!socket || currentToken !== accessToken) {
    if (socket) {
      socket.disconnect();
    }

    currentToken = accessToken;

    socket = io(socketUrl, {
      autoConnect: false,
      auth: {
        token: accessToken
      },
      withCredentials: true
    });
  }

  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
    currentToken = null;
  }
}