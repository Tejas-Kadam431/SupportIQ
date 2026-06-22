import { Router } from "express";
import { authenticate } from "../../common/middleware/auth.middleware.js";
import { validate } from "../../common/middleware/validate.middleware.js";
import { asyncHandler } from "../../common/utils/asyncHandler.js";
import { generateAiDraftHandler } from "./ai.controller.js";
import { generateAiDraftSchema } from "./ai.schema.js";

export const aiRoutes = Router();

aiRoutes.use(authenticate);

aiRoutes.post(
  "/:ticketId/ai-draft",
  validate(generateAiDraftSchema),
  asyncHandler(generateAiDraftHandler)
);