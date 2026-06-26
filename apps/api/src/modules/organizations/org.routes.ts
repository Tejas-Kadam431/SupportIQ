import { Router } from "express";
import { authenticate } from "../../common/middleware/auth.middleware.js";
import { validate } from "../../common/middleware/validate.middleware.js";
import { asyncHandler } from "../../common/utils/asyncHandler.js";
import {
  addMember,
  createOrg,
  getOrg,
  listMembers,
  listOrgs,
  removeMember,
  updateMemberRole,
  updateOrg
} from "./org.controller.js";
import {
  addMemberSchema,
  createOrganizationSchema,
  memberParamSchema,
  orgIdParamSchema,
  updateMemberRoleSchema,
  updateOrganizationSchema
} from "./org.schema.js";
import { requireOrgRole } from "./org.rbac.js";

export const orgRoutes = Router();

orgRoutes.use(authenticate);

orgRoutes.post("/", validate(createOrganizationSchema), asyncHandler(createOrg));

orgRoutes.get("/", asyncHandler(listOrgs));

orgRoutes.get("/:orgId", validate(orgIdParamSchema), asyncHandler(getOrg));

orgRoutes.patch(
  "/:orgId",
  validate(updateOrganizationSchema),
  requireOrgRole(["OWNER", "ADMIN"]),
  asyncHandler(updateOrg)
);

orgRoutes.get(
  "/:orgId/members",
  validate(orgIdParamSchema),
  requireOrgRole(["OWNER", "ADMIN"]),
  asyncHandler(listMembers)
);

orgRoutes.post(
  "/:orgId/members",
  validate(addMemberSchema),
  requireOrgRole(["OWNER", "ADMIN"]),
  asyncHandler(addMember)
);

orgRoutes.patch(
  "/:orgId/members/:memberId",
  validate(updateMemberRoleSchema),
  requireOrgRole(["OWNER", "ADMIN"]),
  asyncHandler(updateMemberRole)
);

orgRoutes.delete(
  "/:orgId/members/:memberId",
  validate(memberParamSchema),
  requireOrgRole(["OWNER", "ADMIN"]),
  asyncHandler(removeMember)
);