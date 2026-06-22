import { Router } from "express";
import { authenticate } from "../../common/middleware/auth.middleware.js";
import { validate } from "../../common/middleware/validate.middleware.js";
import { asyncHandler } from "../../common/utils/asyncHandler.js";
import { listTicketActivityHandler } from "./activity.controller.js";
import { ticketIdParamSchema } from "./activity.schema.js";

export const activityRoutes = Router({
  mergeParams: true
});

activityRoutes.use(authenticate);

activityRoutes.get(
  "/",
  validate(ticketIdParamSchema),
  asyncHandler(listTicketActivityHandler)
);