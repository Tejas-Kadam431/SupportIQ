import type { Prisma } from "@prisma/client";
import { AppError } from "../../common/errors/AppError.js";

// All membership and assignment mutations take this lock FIRST.
// NO KEY UPDATE permits unrelated foreign-key checks. READ COMMITTED statements
// after the lock see the previous holder's committed membership changes.
export async function lockOrganization(tx: Prisma.TransactionClient, orgId: string) {
  await tx.$queryRaw`SELECT "id" FROM "Organization" WHERE "id" = ${orgId} FOR NO KEY UPDATE`;
}

export async function currentMembership(tx: Prisma.TransactionClient, userId: string, orgId: string) {
  const member = await tx.organizationMember.findUnique({
    where: { organizationId_userId: { organizationId: orgId, userId } }
  });
  if (!member) throw new AppError("Organization access denied", 403);
  return member;
}
