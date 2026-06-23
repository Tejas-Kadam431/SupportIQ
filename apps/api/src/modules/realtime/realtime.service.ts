import type { Server as HttpServer } from "http";
import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import { prisma } from "../../config/prisma.js";
import { env } from "../../config/env.js";
import type {
  ClientToServerEvents,
  InterServerEvents,
  ServerToClientEvents,
  SocketData
} from "./realtime.types.js";

type AppSocketServer = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;

let io: AppSocketServer | null = null;

function ticketRoom(ticketId: string) {
  return `ticket:${ticketId}`;
}

function extractToken(authHeader?: string) {
  if (!authHeader) return null;

  if (authHeader.startsWith("Bearer ")) {
    return authHeader.slice("Bearer ".length);
  }

  return authHeader;
}

export function initRealtimeServer(httpServer: HttpServer) {
  io = new Server<
    ClientToServerEvents,
    ServerToClientEvents,
    InterServerEvents,
    SocketData
  >(httpServer, {
    cors: {
      origin: process.env.CLIENT_URL ?? "http://localhost:5173",
      credentials: true
    }
  });

  io.use(async (socket, next) => {
    try {
      const tokenFromAuth = socket.handshake.auth?.token;
      const tokenFromHeader = extractToken(
        socket.handshake.headers.authorization
      );

      const token =
        typeof tokenFromAuth === "string" ? tokenFromAuth : tokenFromHeader;

      if (!token) {
        return next(new Error("Missing socket auth token"));
      }

      const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET) as {
        sub?: string;
        email?: string;
      };

      if (!decoded.sub) {
        return next(new Error("Invalid socket auth token"));
      }

      socket.data.userId = decoded.sub;
      socket.data.email = decoded.email ?? "";

      next();
    } catch {
      next(new Error("Invalid socket auth token"));
    }
  });

  io.on("connection", (socket) => {
    socket.on("ticket:join", async (payload, callback) => {
      try {
        const ticketId = payload?.ticketId;

        if (!ticketId) {
          callback?.({ ok: false, error: "ticketId is required" });
          return;
        }

        const ticket = await prisma.ticket.findUnique({
          where: {
            id: ticketId
          },
          select: {
            id: true,
            organizationId: true,
            customerId: true
          }
        });

        if (!ticket) {
          callback?.({ ok: false, error: "Ticket not found" });
          return;
        }

        const membership = await prisma.organizationMember.findUnique({
          where: {
            organizationId_userId: {
              organizationId: ticket.organizationId,
              userId: socket.data.userId
            }
          },
          select: {
            id: true,
            role: true
          }
        });

        if (!membership) {
          callback?.({
            ok: false,
            error: "You are not a member of this organization"
          });
          return;
        }

        const isCustomer = membership.role === "CUSTOMER";

        if (isCustomer && ticket.customerId !== socket.data.userId) {
          callback?.({ ok: false, error: "You cannot join this ticket" });
          return;
        }

        await socket.join(ticketRoom(ticketId));

        callback?.({ ok: true });
      } catch {
        callback?.({ ok: false, error: "Failed to join ticket room" });
      }
    });

    socket.on("ticket:leave", async (payload, callback) => {
      const ticketId = payload?.ticketId;

      if (!ticketId) {
        callback?.({ ok: false, error: "ticketId is required" });
        return;
      }

      await socket.leave(ticketRoom(ticketId));

      callback?.({ ok: true });
    });
  });

  return io;
}

export function getRealtimeServer() {
  return io;
}

export function emitTicketMessageCreated(payload: {
  ticketId: string;
  message: {
    id: string;
    ticketId: string;
    senderId: string;
    body: string;
    createdAt: Date;
    sender: {
      id: string;
      name: string;
      email: string;
      avatarUrl: string | null;
    };
  };
}) {
  if (!io) return;

  io.to(ticketRoom(payload.ticketId)).emit("ticket:message_created", {
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
  });
}