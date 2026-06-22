import { Router } from "express";
import { authenticate } from "../../common/middleware/auth.middleware.js";
import { validate } from "../../common/middleware/validate.middleware.js";
import { asyncHandler } from "../../common/utils/asyncHandler.js";
import { requireOrgRole } from "../organizations/org.rbac.js";
import { getDashboardHandler } from "./dashboard.controller.js";
import { orgIdParamSchema } from "./dashboard.schema.js";

export const dashboardRoutes = Router({
  mergeParams: true
});

dashboardRoutes.use(authenticate);

dashboardRoutes.get(
  "/",
  validate(orgIdParamSchema),
  requireOrgRole(["OWNER", "ADMIN", "AGENT"]),
  asyncHandler(getDashboardHandler)
);