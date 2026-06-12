import type { Response } from "express";
import type { AuthenticatedRequest } from "../../common/middleware/auth.middleware.js";
import { AppError } from "../../common/errors/AppError.js";
import { createTicket, listTickets } from "./ticket.service.js";
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