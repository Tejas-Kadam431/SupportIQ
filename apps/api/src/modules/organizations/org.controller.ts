import type { Response } from "express";
import type { AuthenticatedRequest } from "../../common/middleware/auth.middleware.js";
import { AppError } from "../../common/errors/AppError.js";
import {
  addOrganizationMember,
  createOrganization,
  getOrganizationById,
  listOrganizationMembers,
  listUserOrganizations,
  removeOrganizationMember,
  updateOrganization,
  updateOrganizationMemberRole
} from "./org.service.js";

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

export async function createOrg(req: AuthenticatedRequest, res: Response) {
  const userId = getUserId(req);
  const organization = await createOrganization(userId, req.body);

  return res.status(201).json({
    message: "Organization created successfully",
    data: {
      organization
    }
  });
}

export async function listOrgs(req: AuthenticatedRequest, res: Response) {
  const userId = getUserId(req);
  const organizations = await listUserOrganizations(userId);

  return res.status(200).json({
    data: {
      organizations
    }
  });
}

export async function getOrg(req: AuthenticatedRequest, res: Response) {
  const userId = getUserId(req);
  const orgId = getParam(req, "orgId");

  const result = await getOrganizationById(userId, orgId);

  return res.status(200).json({
    data: result
  });
}

export async function updateOrg(req: AuthenticatedRequest, res: Response) {
  const userId = getUserId(req);
  const orgId = getParam(req, "orgId");

  const organization = await updateOrganization(userId, orgId, req.body);

  return res.status(200).json({
    message: "Organization updated successfully",
    data: {
      organization
    }
  });
}

export async function listMembers(req: AuthenticatedRequest, res: Response) {
  const userId = getUserId(req);
  const orgId = getParam(req, "orgId");

  const members = await listOrganizationMembers(userId, orgId);

  return res.status(200).json({
    data: {
      members
    }
  });
}

export async function addMember(req: AuthenticatedRequest, res: Response) {
  const userId = getUserId(req);
  const orgId = getParam(req, "orgId");

  const member = await addOrganizationMember(userId, orgId, req.body);

  return res.status(201).json({
    message: "Member added successfully",
    data: {
      member
    }
  });
}

export async function updateMemberRole(req: AuthenticatedRequest, res: Response) {
  const userId = getUserId(req);
  const orgId = getParam(req, "orgId");
  const memberId = getParam(req, "memberId");

  const member = await updateOrganizationMemberRole(
    userId,
    orgId,
    memberId,
    req.body
  );

  return res.status(200).json({
    message: "Member role updated successfully",
    data: {
      member
    }
  });
}

export async function removeMember(req: AuthenticatedRequest, res: Response) {
  const userId = getUserId(req);
  const orgId = getParam(req, "orgId");
  const memberId = getParam(req, "memberId");

  await removeOrganizationMember(userId, orgId, memberId);

  return res.status(200).json({
    message: "Member removed successfully"
  });
}