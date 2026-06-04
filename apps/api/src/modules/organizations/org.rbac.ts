import type { NextFunction, Response } from "express";
import type { AuthenticatedRequest } from "../../common/middleware/auth.middleware.js";
import { AppError } from "../../common/errors/AppError.js";
import { assertOrgMember, assertOrgRole } from "./org.service.js";

export type OrganizationRole = "OWNER" | "ADMIN" | "AGENT" | "CUSTOMER";

export type OrgRequest = AuthenticatedRequest & {
  org?: {
    id: string;
    role: OrganizationRole;
  };
};

export function requireOrgMember() {
  return async (req: OrgRequest, _res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        throw new AppError("Authentication required", 401);
      }

      const orgId = req.params.orgId;

      if (!orgId) {
        throw new AppError("Organization id is required", 400);
      }

      const membership = await assertOrgMember(req.user.id, orgId);

      req.org = {
        id: orgId,
        role: membership.role as OrganizationRole
      };

      next();
    } catch (error) {
      next(error);
    }
  };
}

export function requireOrgRole(allowedRoles: OrganizationRole[]) {
  return async (req: OrgRequest, _res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        throw new AppError("Authentication required", 401);
      }

      const orgId = req.params.orgId;

      if (!orgId) {
        throw new AppError("Organization id is required", 400);
      }

      const membership = await assertOrgRole(req.user.id, orgId, allowedRoles);

      req.org = {
        id: orgId,
        role: membership.role as OrganizationRole
      };

      next();
    } catch (error) {
      next(error);
    }
  };
}