import type { Response } from "express";
import { getCopilotRun, sendCopilotResponse } from "./ai.decision.js";
import { AppError } from "../../common/errors/AppError.js";
import type { AuthenticatedRequest } from "../../common/middleware/auth.middleware.js";
import {
  evaluateCopilotRun,
  generateAiDraftReply
} from "./ai.service.js";

function getUserId(req: AuthenticatedRequest) {
  if (!req.user) {
    throw new AppError("Authentication required", 401);
  }

  return req.user.id;
}

function getParam(
  req: AuthenticatedRequest,
  key: string
) {
  const value = req.params[key];

  if (typeof value !== "string") {
    throw new AppError(
      `${key} parameter is required`,
      400
    );
  }

  return value;
}

export async function generateAiDraftHandler(
  req: AuthenticatedRequest,
  res: Response
) {
  const userId = getUserId(req);
  const ticketId = getParam(req, "ticketId");

  const result = await generateAiDraftReply(
    userId,
    ticketId,
    req.body
  );

  return res.status(200).json({
    message: "AI Copilot run generated successfully",
    data: result
  });
}

export async function evaluateCopilotHandler(
  req: AuthenticatedRequest,
  res: Response
) {
  const userId = getUserId(req);
  const ticketId = getParam(req, "ticketId");
  const runId = getParam(req, "runId");

  const evaluation = await evaluateCopilotRun(
    userId,
    ticketId,
    runId,
    req.body
  );

  return res.status(200).json({
    message: "Copilot feedback saved successfully",
    data: {
      evaluation
    }
  });
}

export async function sendCopilotHandler(req: AuthenticatedRequest, res: Response) {
  const result = await sendCopilotResponse(getUserId(req), getParam(req, "ticketId"), getParam(req, "runId"), req.body);
  return res.status(result.replayed ? 200 : 201).json({ message: "Copilot reply sent", data: result });
}

export async function getCopilotRunHandler(req: AuthenticatedRequest, res: Response) {
  const run = await getCopilotRun(getUserId(req), getParam(req, "ticketId"), getParam(req, "runId"));
  return res.json({ data: { run } });
}
