import { Router } from "express";
import { authenticate } from "../../common/middleware/auth.middleware.js";
import { blockDemoWrites } from "../../common/middleware/demoReadOnly.middleware.js";
import { validate } from "../../common/middleware/validate.middleware.js";
import { asyncHandler } from "../../common/utils/asyncHandler.js";
import {
  evaluateCopilotHandler,
  generateAiDraftHandler
} from "./ai.controller.js";
import {
  evaluateCopilotSchema,
  generateAiDraftSchema
} from "./ai.schema.js";

export const aiRoutes = Router();

aiRoutes.use(authenticate);

aiRoutes.post(
  "/:ticketId/ai-draft",
  validate(generateAiDraftSchema),
  asyncHandler(generateAiDraftHandler)
);

aiRoutes.put(
  "/:ticketId/copilot-runs/:runId/evaluation",
  blockDemoWrites(
    "Demo account cannot submit Copilot feedback."
  ),
  validate(evaluateCopilotSchema),
  asyncHandler(evaluateCopilotHandler)
);