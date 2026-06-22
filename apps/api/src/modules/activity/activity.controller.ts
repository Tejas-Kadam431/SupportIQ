import type { Response } from "express";
import { AppError } from "../../common/errors/AppError.js";
import type { AuthenticatedRequest } from "../../common/middleware/auth.middleware.js";
import { listTicketActivity } from "./activity.service.js";

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

export async function listTicketActivityHandler(
  req: AuthenticatedRequest,
  res: Response
) {
  const userId = getUserId(req);
  const ticketId = getParam(req, "ticketId");

  const activities = await listTicketActivity(userId, ticketId);

  return res.status(200).json({
    data: {
      activities
    }
  });
}