import { Router } from "express";
import { authenticate } from "../../common/middleware/auth.middleware.js";
import { validate } from "../../common/middleware/validate.middleware.js";
import { asyncHandler } from "../../common/utils/asyncHandler.js";
import { requireOrgMember } from "../organizations/org.rbac.js";
import { createTicketHandler, listTicketsHandler } from "./ticket.controller.js";
import { createTicketSchema, listTicketsSchema } from "./ticket.schema.js";

export const ticketRoutes = Router({
  mergeParams: true
});

ticketRoutes.use(authenticate);
ticketRoutes.use(requireOrgMember());

ticketRoutes.post("/", validate(createTicketSchema), asyncHandler(createTicketHandler));
ticketRoutes.get("/", validate(listTicketsSchema), asyncHandler(listTicketsHandler));