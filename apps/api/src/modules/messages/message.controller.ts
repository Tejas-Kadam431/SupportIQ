import type { Response } from "express";
import { AppError } from "../../common/errors/AppError.js";
import type { AuthenticatedRequest } from "../../common/middleware/auth.middleware.js";
import { createTicketMessage, listTicketMessages } from "./message.service.js";

function getUserId(req: AuthenticatedRequest) {
  if (!req.user) {
    throw new AppError("Authentication required", 401);
  }

  return req.user.id;
}

function getParam(req: AuthenticatedRequest, key: string) {
  const value = req.params[key];

  if (typeof value !== "string") {
    throw new AppError(`${key} parameter is required`, 400);
  }

  return value;
}

export async function listMessagesHandler(req: AuthenticatedRequest, res: Response) {
  const userId = getUserId(req);
  const ticketId = getParam(req, "ticketId");

  const messages = await listTicketMessages(userId, ticketId);

  return res.status(200).json({
    data: {
      messages
    }
  });
}

export async function createMessageHandler(req: AuthenticatedRequest, res: Response) {
  const userId = getUserId(req);
  const ticketId = getParam(req, "ticketId");

  const message = await createTicketMessage(userId, ticketId, req.body);

  return res.status(201).json({
    message: "Message sent successfully",
    data: {
      message
    }
  });
}