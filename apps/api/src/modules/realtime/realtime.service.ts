import type { Server as HttpServer } from "http";
import { Server, type Socket } from "socket.io";
import { verifyAccessToken } from "../../common/utils/jwt.js";
import { isAllowedOrigin } from "../../config/origins.js";
import { canUserAccessTicket, isTicketId } from "./realtime.authorization.js";
import { logRealtimeFailure } from "./realtime.logging.js";
import type {
  ClientToServerEvents, InterServerEvents, ServerToClientEvents, SocketData
} from "./realtime.types.js";

type AppSocketServer = Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
type AppSocket = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
let io: AppSocketServer | null = null;
const ACCESS_DENIED = "Ticket access denied";
const MAX_TIMER_DELAY = 2_147_483_647;

function ticketRoom(ticketId: string) {
  return `ticket:${ticketId}`;
}

function extractToken(authHeader?: string) {
  return authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : authHeader;
}

function sessionIsLive(socket: AppSocket) {
  if (!socket.connected) return false;
  if (!Number.isFinite(socket.data.expiresAt) || Date.now() >= socket.data.expiresAt) {
    socket.disconnect(true);
    return false;
  }
  return true;
}

function enforceExpiry(socket: AppSocket) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const schedule = () => {
    if (!sessionIsLive(socket)) return;
    // Long configured lifetimes must not overflow Node's timer limit.
    timer = setTimeout(schedule, Math.max(1, Math.min(
      socket.data.expiresAt - Date.now(), MAX_TIMER_DELAY
    )));
    timer.unref();
  };
  socket.once("disconnect", () => clearTimeout(timer));
  schedule();
}

export function initRealtimeServer(httpServer: HttpServer) {
  const server = new Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>(
    httpServer,
    {
      cors: {
        origin: (origin, callback) => callback(null, isAllowedOrigin(origin)),
        credentials: true
      },
      // CORS alone does not restrict native WebSocket handshakes.
      allowRequest: (request, callback) => {
        const allowed = isAllowedOrigin(request.headers.origin);
        callback(allowed ? null : "Origin not allowed", allowed);
      }
    }
  );
  io = server;
  server.use((socket, next) => {
    try {
      const token = socket.handshake.auth?.token ??
        extractToken(socket.handshake.headers.authorization);
      if (typeof token !== "string" || !token) throw new Error("Invalid token");
      const claims = verifyAccessToken(token);
      socket.data.userId = claims.sub;
      socket.data.expiresAt = claims.exp * 1000;
      next();
    } catch {
      next(new Error("Invalid or expired socket auth token"));
    }
  });

  server.on("connection", socket => {
    enforceExpiry(socket);
    socket.on("ticket:join", async (payload, callback) => {
      const reply = (ok: boolean, error?: string) => {
        if (typeof callback === "function") callback(error ? { ok, error } : { ok });
      };
      const ticketId = payload?.ticketId;
      if (!isTicketId(ticketId)) {
        reply(false, "Invalid ticketId");
        return;
      }
      try {
        if (!sessionIsLive(socket)) return;
        const allowed = await canUserAccessTicket(socket.data.userId, ticketId);
        if (!sessionIsLive(socket)) return;
        if (!allowed) {
          await socket.leave(ticketRoom(ticketId));
          reply(false, ACCESS_DENIED);
          return;
        }
        await socket.join(ticketRoom(ticketId));
        if (!sessionIsLive(socket)) return;
        reply(true);
      } catch {
        logRealtimeFailure("join");
        reply(false, ACCESS_DENIED);
      }
    });

    socket.on("ticket:leave", async (payload, callback) => {
      const reply = (ok: boolean, error?: string) => {
        if (typeof callback === "function") callback(error ? { ok, error } : { ok });
      };
      if (!isTicketId(payload?.ticketId)) {
        reply(false, "Invalid ticketId");
        return;
      }
      try {
        await socket.leave(ticketRoom(payload.ticketId));
        reply(true);
      } catch {
        logRealtimeFailure("leave");
        reply(false, ACCESS_DENIED);
      }
    });
  });
  return server;
}

export function getRealtimeServer() {
  return io;
}

export async function emitTicketMessageCreated(payload: {
  ticketId: string;
  message: {
    id: string;
    ticketId: string;
    senderId: string;
    body: string;
    createdAt: Date;
    sender: { id: string; name: string; email: string; avatarUrl: string | null };
  };
}) {
  const server = io;
  if (!server) return;
  if (!isTicketId(payload.ticketId) || payload.message.ticketId !== payload.ticketId) {
    logRealtimeFailure("notification");
    return;
  }
  const room = ticketRoom(payload.ticketId);
  // Single-process deployment: room membership is only a candidate list.
  // A shared adapter will also need distributed recipient enumeration.
  const ids = [...(server.sockets.adapter.rooms.get(room) ?? [])];
  const event = {
    ticketId: payload.ticketId,
    message: {
      id: payload.message.id,
      ticketId: payload.message.ticketId,
      senderId: payload.message.senderId,
      body: payload.message.body,
      createdAt: payload.message.createdAt.toISOString(),
      sender: {
        id: payload.message.sender.id,
        name: payload.message.sender.name,
        email: payload.message.sender.email,
        avatarUrl: payload.message.sender.avatarUrl
      }
    }
  };
  await Promise.all(ids.map(async id => {
    const socket = server.sockets.sockets.get(id);
    if (!socket || !sessionIsLive(socket)) return;
    try {
      const allowed = await canUserAccessTicket(socket.data.userId, payload.ticketId);
      if (!allowed) {
        await socket.leave(room);
        return;
      }
      // Recheck after lookup: no late, disconnected or unsubscribed delivery.
      if (sessionIsLive(socket) && socket.rooms.has(room)) {
        socket.emit("ticket:message_created", event);
      }
    } catch {
      logRealtimeFailure("delivery");
      // Fail closed, including adapter/DB failures. No payload is emitted.
      socket.disconnect(true);
    }
  }));
}
