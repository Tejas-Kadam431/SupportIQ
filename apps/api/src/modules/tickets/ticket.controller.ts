import type { Response } from "express";
import type { AuthenticatedRequest } from "../../common/middleware/auth.middleware.js";
import { AppError } from "../../common/errors/AppError.js";
import {
  assignTicket,
  createTicket,
  getTicketDetails,
  listTickets,
  updateTicketStatus
} from "./ticket.service.js";
import type { ListTicketsQuery } from "./ticket.schema.js";

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

export async function createTicketHandler(req: AuthenticatedRequest, res: Response) {
  const userId = getUserId(req);
  const orgId = getParam(req, "orgId");

  const ticket = await createTicket(userId, orgId, req.body);

  return res.status(201).json({
    message: "Ticket created successfully",
    data: {
      ticket
    }
  });
}

export async function listTicketsHandler(req: AuthenticatedRequest, res: Response) {
  const userId = getUserId(req);
  const orgId = getParam(req, "orgId");

  const result = await listTickets(userId, orgId, req.query as unknown as ListTicketsQuery);

  return res.status(200).json({
    data: result
  });
}

export async function getTicketDetailsHandler(req: AuthenticatedRequest, res: Response) {
  const userId = getUserId(req);
  const ticketId = getParam(req, "ticketId");

  const ticket = await getTicketDetails(userId, ticketId);

  return res.status(200).json({
    data: {
      ticket
    }
  });
}

export async function updateTicketStatusHandler(req: AuthenticatedRequest, res: Response) {
  const userId = getUserId(req);
  const ticketId = getParam(req, "ticketId");

  const ticket = await updateTicketStatus(userId, ticketId, req.body);

  return res.status(200).json({
    message: "Ticket status updated successfully",
    data: {
      ticket
    }
  });
}

export async function assignTicketHandler(req: AuthenticatedRequest, res: Response) {
  const userId = getUserId(req);
  const ticketId = getParam(req, "ticketId");

  const ticket = await assignTicket(userId, ticketId, req.body);

  return res.status(200).json({
    message: "Ticket assignment updated successfully",
    data: {
      ticket
    }
  });
}