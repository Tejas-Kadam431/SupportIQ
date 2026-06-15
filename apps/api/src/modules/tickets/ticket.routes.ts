import { Router } from "express";
import { authenticate } from "../../common/middleware/auth.middleware.js";
import { validate } from "../../common/middleware/validate.middleware.js";
import { asyncHandler } from "../../common/utils/asyncHandler.js";
import { requireOrgMember } from "../organizations/org.rbac.js";
import {
  assignTicketHandler,
  createTicketHandler,
  getTicketDetailsHandler,
  listTicketsHandler,
  updateTicketStatusHandler
} from "./ticket.controller.js";
import {
  assignTicketSchema,
  createTicketSchema,
  listTicketsSchema,
  ticketIdParamSchema,
  updateTicketStatusSchema
} from "./ticket.schema.js";

export const orgTicketRoutes = Router({
  mergeParams: true
});

orgTicketRoutes.use(authenticate);
orgTicketRoutes.use(requireOrgMember());

orgTicketRoutes.post("/", validate(createTicketSchema), asyncHandler(createTicketHandler));
orgTicketRoutes.get("/", validate(listTicketsSchema), asyncHandler(listTicketsHandler));

export const ticketRoutes = Router();

ticketRoutes.use(authenticate);

ticketRoutes.get(
  "/:ticketId",
  validate(ticketIdParamSchema),
  asyncHandler(getTicketDetailsHandler)
);

ticketRoutes.patch(
  "/:ticketId/status",
  validate(updateTicketStatusSchema),
  asyncHandler(updateTicketStatusHandler)
);

ticketRoutes.patch(
  "/:ticketId/assign",
  validate(assignTicketSchema),
  asyncHandler(assignTicketHandler)
);