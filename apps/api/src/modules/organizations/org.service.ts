import { prisma } from "../../config/prisma.js";
import { AppError } from "../../common/errors/AppError.js";
import type {
  AddMemberInput,
  CreateOrganizationInput,
  UpdateMemberRoleInput,
  UpdateOrganizationInput
} from "./org.schema.js";

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

export async function createOrganization(userId: string, input: CreateOrganizationInput) {
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
  await assertOrgMember(userId, orgId);

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

export async function addOrganizationMember(userId: string, orgId: string, input: AddMemberInput) {
  await assertOrgRole(userId, orgId, ["OWNER", "ADMIN"]);

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
      role: input.role
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
  const actorMembership = await assertOrgRole(userId, orgId, ["OWNER", "ADMIN"]);

  const targetMembership = await prisma.organizationMember.findUnique({
    where: {
      id: memberId
    }
  });

  if (!targetMembership || targetMembership.organizationId !== orgId) {
    throw new AppError("Member not found", 404);
  }

  if (targetMembership.role === "OWNER") {
    throw new AppError("Owner role cannot be changed", 403);
  }

  if (actorMembership.role === "ADMIN" && targetMembership.role === "ADMIN") {
    throw new AppError("Admins cannot modify other admins", 403);
  }

  return prisma.organizationMember.update({
    where: {
      id: memberId
    },
    data: {
      role: input.role
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

export async function removeOrganizationMember(userId: string, orgId: string, memberId: string) {
  const actorMembership = await assertOrgRole(userId, orgId, ["OWNER", "ADMIN"]);

  const targetMembership = await prisma.organizationMember.findUnique({
    where: {
      id: memberId
    }
  });

  if (!targetMembership || targetMembership.organizationId !== orgId) {
    throw new AppError("Member not found", 404);
  }

  if (targetMembership.role === "OWNER") {
    throw new AppError("Owner cannot be removed from organization", 403);
  }

  if (actorMembership.role === "ADMIN" && targetMembership.role === "ADMIN") {
    throw new AppError("Admins cannot remove other admins", 403);
  }

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

export async function assertOrgRole(userId: string, orgId: string, allowedRoles: string[]) {
  const membership = await assertOrgMember(userId, orgId);

  if (!allowedRoles.includes(membership.role)) {
    throw new AppError("Insufficient permissions", 403);
  }

  return membership;
}