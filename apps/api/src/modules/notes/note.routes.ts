import { Router } from "express";
import { authenticate } from "../../common/middleware/auth.middleware.js";
import { validate } from "../../common/middleware/validate.middleware.js";
import { asyncHandler } from "../../common/utils/asyncHandler.js";
import { createNoteHandler, listNotesHandler } from "./note.controller.js";
import { createNoteSchema, ticketIdParamSchema } from "./note.schema.js";

export const noteRoutes = Router({
  mergeParams: true
});

noteRoutes.use(authenticate);

noteRoutes.get(
  "/",
  validate(ticketIdParamSchema),
  asyncHandler(listNotesHandler)
);

noteRoutes.post(
  "/",
  validate(createNoteSchema),
  asyncHandler(createNoteHandler)
);