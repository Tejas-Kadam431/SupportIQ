import type { Response } from "express";
import { AppError } from "../../common/errors/AppError.js";
import type { AuthenticatedRequest } from "../../common/middleware/auth.middleware.js";
import { getOrganizationDashboard } from "./dashboard.service.js";

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

export async function getDashboardHandler(
  req: AuthenticatedRequest,
  res: Response
) {
  const userId = getUserId(req);
  const orgId = getParam(req, "orgId");

  const dashboard = await getOrganizationDashboard(userId, orgId);

  return res.status(200).json({
    data: dashboard
  });
}