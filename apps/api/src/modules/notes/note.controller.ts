import type { Response } from "express";
import { AppError } from "../../common/errors/AppError.js";
import type { AuthenticatedRequest } from "../../common/middleware/auth.middleware.js";
import { createInternalNote, listInternalNotes } from "./note.service.js";

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

export async function listNotesHandler(req: AuthenticatedRequest, res: Response) {
  const userId = getUserId(req);
  const ticketId = getParam(req, "ticketId");

  const notes = await listInternalNotes(userId, ticketId);

  return res.status(200).json({
    data: {
      notes
    }
  });
}

export async function createNoteHandler(req: AuthenticatedRequest, res: Response) {
  const userId = getUserId(req);
  const ticketId = getParam(req, "ticketId");

  const note = await createInternalNote(userId, ticketId, req.body);

  return res.status(201).json({
    message: "Internal note added successfully",
    data: {
      note
    }
  });
}