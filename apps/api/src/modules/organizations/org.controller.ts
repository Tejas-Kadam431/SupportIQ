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
  const result = await getOrganizationById(userId, req.params.orgId);

  return res.status(200).json({
    data: result
  });
}

export async function updateOrg(req: AuthenticatedRequest, res: Response) {
  const userId = getUserId(req);
  const organization = await updateOrganization(userId, req.params.orgId, req.body);

  return res.status(200).json({
    message: "Organization updated successfully",
    data: {
      organization
    }
  });
}

export async function listMembers(req: AuthenticatedRequest, res: Response) {
  const userId = getUserId(req);
  const members = await listOrganizationMembers(userId, req.params.orgId);

  return res.status(200).json({
    data: {
      members
    }
  });
}

export async function addMember(req: AuthenticatedRequest, res: Response) {
  const userId = getUserId(req);
  const member = await addOrganizationMember(userId, req.params.orgId, req.body);

  return res.status(201).json({
    message: "Member added successfully",
    data: {
      member
    }
  });
}

export async function updateMemberRole(req: AuthenticatedRequest, res: Response) {
  const userId = getUserId(req);

  const member = await updateOrganizationMemberRole(
    userId,
    req.params.orgId,
    req.params.memberId,
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

  await removeOrganizationMember(userId, req.params.orgId, req.params.memberId);

  return res.status(200).json({
    message: "Member removed successfully"
  });
}