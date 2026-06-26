import { prisma } from "../../config/prisma.js";
import { AppError } from "../../common/errors/AppError.js";
import type {
  AddMemberInput,
  CreateOrganizationInput,
  UpdateMemberRoleInput,
  UpdateOrganizationInput
} from "./org.schema.js";

type Role = "OWNER" | "ADMIN" | "AGENT" | "CUSTOMER";

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");
}

async function createUniqueSlug(name: string) {
  const baseSlug = slugify(name) || "organization";
  let slug = baseSlug;
  let counter = 1;

  while (true) {
    const existing = await prisma.organization.findUnique({
      where: { slug }
    });

    if (!existing) return slug;

    slug = `${baseSlug}-${counter}`;
    counter += 1;
  }
}

function assertRoleIsNotOwner(role: Role) {
  if (role === "OWNER") {
    throw new AppError("Owner role is protected", 403);
  }
}

function assertActorCanAssignRole(actorRole: Role, nextRole: Role) {
  if (nextRole === "OWNER") {
    throw new AppError("Owner role cannot be assigned manually", 403);
  }

  if (actorRole === "OWNER") return;

  if (actorRole !== "ADMIN") {
    throw new AppError("Insufficient permissions", 403);
  }

  if (nextRole === "ADMIN") {
    throw new AppError("Admins cannot grant admin access", 403);
  }
}

function assertActorCanManageTargetRole(actorRole: Role, targetRole: Role) {
  if (actorRole === "OWNER") return;

  if (actorRole !== "ADMIN") {
    throw new AppError("Insufficient permissions", 403);
  }

  if (targetRole === "OWNER" || targetRole === "ADMIN") {
    throw new AppError("Admins cannot manage owners or other admins", 403);
  }
}

export async function createOrganization(
  userId: string,
  input: CreateOrganizationInput
) {
  const slug = await createUniqueSlug(input.name);

  const organization = await prisma.$transaction(async (tx) => {
    const org = await tx.organization.create({
      data: {
        name: input.name,
        slug,
        ownerId: userId
      }
    });

    await tx.organizationMember.create({
      data: {
        organizationId: org.id,
        userId,
        role: "OWNER"
      }
    });

    return org;
  });

  return organization;
}

export async function listUserOrganizations(userId: string) {
  const memberships = await prisma.organizationMember.findMany({
    where: {
      userId
    },
    include: {
      organization: true
    },
    orderBy: {
      createdAt: "desc"
    }
  });

  return memberships.map((membership) => ({
    membershipId: membership.id,
    role: membership.role,
    organization: membership.organization
  }));
}

export async function getOrganizationById(userId: string, orgId: string) {
  const membership = await prisma.organizationMember.findUnique({
    where: {
      organizationId_userId: {
        organizationId: orgId,
        userId
      }
    },
    include: {
      organization: true
    }
  });

  if (!membership) {
    throw new AppError("Organization not found or access denied", 404);
  }

  return {
    role: membership.role,
    organization: membership.organization
  };
}

export async function updateOrganization(
  userId: string,
  orgId: string,
  input: UpdateOrganizationInput
) {
  await assertOrgRole(userId, orgId, ["OWNER", "ADMIN"]);

  const data: {
    name?: string;
    slug?: string;
  } = {};

  if (input.name) {
    data.name = input.name;
    data.slug = await createUniqueSlug(input.name);
  }

  return prisma.organization.update({
    where: {
      id: orgId
    },
    data
  });
}

export async function listOrganizationMembers(userId: string, orgId: string) {
  await assertOrgRole(userId, orgId, ["OWNER", "ADMIN"]);

  return prisma.organizationMember.findMany({
    where: {
      organizationId: orgId
    },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          avatarUrl: true,
          createdAt: true
        }
      }
    },
    orderBy: {
      createdAt: "asc"
    }
  });
}

export async function addOrganizationMember(
  userId: string,
  orgId: string,
  input: AddMemberInput
) {
  const actorMembership = await assertOrgRole(userId, orgId, [
    "OWNER",
    "ADMIN"
  ]);

  const actorRole = actorMembership.role as Role;
  const nextRole = input.role as Role;

  assertActorCanAssignRole(actorRole, nextRole);

  const userToAdd = await prisma.user.findUnique({
    where: {
      email: input.email.toLowerCase()
    }
  });

  if (!userToAdd) {
    throw new AppError("User with this email does not exist", 404);
  }

  const existingMembership = await prisma.organizationMember.findUnique({
    where: {
      organizationId_userId: {
        organizationId: orgId,
        userId: userToAdd.id
      }
    }
  });

  if (existingMembership) {
    throw new AppError("User is already a member of this organization", 409);
  }

  return prisma.organizationMember.create({
    data: {
      organizationId: orgId,
      userId: userToAdd.id,
      role: nextRole
    },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          avatarUrl: true
        }
      }
    }
  });
}

export async function updateOrganizationMemberRole(
  userId: string,
  orgId: string,
  memberId: string,
  input: UpdateMemberRoleInput
) {
  const actorMembership = await assertOrgRole(userId, orgId, [
    "OWNER",
    "ADMIN"
  ]);

  const actorRole = actorMembership.role as Role;
  const nextRole = input.role as Role;

  assertActorCanAssignRole(actorRole, nextRole);

  const targetMembership = await prisma.organizationMember.findUnique({
    where: {
      id: memberId
    }
  });

  if (!targetMembership || targetMembership.organizationId !== orgId) {
    throw new AppError("Member not found", 404);
  }

  const targetRole = targetMembership.role as Role;

  assertRoleIsNotOwner(targetRole);
  assertActorCanManageTargetRole(actorRole, targetRole);

  return prisma.organizationMember.update({
    where: {
      id: memberId
    },
    data: {
      role: nextRole
    },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          avatarUrl: true
        }
      }
    }
  });
}

export async function removeOrganizationMember(
  userId: string,
  orgId: string,
  memberId: string
) {
  const actorMembership = await assertOrgRole(userId, orgId, [
    "OWNER",
    "ADMIN"
  ]);

  const actorRole = actorMembership.role as Role;

  const targetMembership = await prisma.organizationMember.findUnique({
    where: {
      id: memberId
    }
  });

  if (!targetMembership || targetMembership.organizationId !== orgId) {
    throw new AppError("Member not found", 404);
  }

  const targetRole = targetMembership.role as Role;

  assertRoleIsNotOwner(targetRole);
  assertActorCanManageTargetRole(actorRole, targetRole);

  await prisma.organizationMember.delete({
    where: {
      id: memberId
    }
  });
}

export async function assertOrgMember(userId: string, orgId: string) {
  const membership = await prisma.organizationMember.findUnique({
    where: {
      organizationId_userId: {
        organizationId: orgId,
        userId
      }
    }
  });

  if (!membership) {
    throw new AppError("Organization access denied", 403);
  }

  return membership;
}

export async function assertOrgRole(
  userId: string,
  orgId: string,
  allowedRoles: string[]
) {
  const membership = await assertOrgMember(userId, orgId);

  if (!allowedRoles.includes(membership.role)) {
    throw new AppError("Insufficient permissions", 403);
  }

  return membership;
}