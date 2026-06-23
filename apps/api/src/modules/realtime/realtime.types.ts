export type ServerToClientEvents = {
  "ticket:message_created": (payload: {
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
  }) => void;
};

export type ClientToServerEvents = {
  "ticket:join": (
    payload: {
      ticketId: string;
    },
    callback?: (response: { ok: boolean; error?: string }) => void
  ) => void;

  "ticket:leave": (
    payload: {
      ticketId: string;
    },
    callback?: (response: { ok: boolean; error?: string }) => void
  ) => void;
};

export type InterServerEvents = Record<string, never>;

export type SocketData = {
  userId: string;
  email: string;
};