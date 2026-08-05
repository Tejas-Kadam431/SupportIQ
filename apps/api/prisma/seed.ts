import { PrismaClient, Role } from "@prisma/client";
import { hashPassword } from "../src/common/utils/password.js";

const prisma = new PrismaClient();

async function main() {
  await prisma.organizationMember.deleteMany();
  await prisma.organization.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.user.deleteMany();

  const ownerPasswordHash = await hashPassword("password123");

  const owner = await prisma.user.create({
    data: {
      name: "Demo Owner",
      email: "demo.owner@supportiq.app",
      passwordHash: ownerPasswordHash
    }
  });

  const agent = await prisma.user.create({
    data: {
      name: "Demo Agent",
      email: "agent@supportiq.dev",
      passwordHash: ownerPasswordHash
    }
  });

  const customer = await prisma.user.create({
    data: {
      name: "Demo Customer",
      email: "customer@supportiq.dev",
      passwordHash: ownerPasswordHash
    }
  });

  const organization = await prisma.organization.create({
    data: {
      name: "Demo Company",
      slug: "demo-company",
      ownerId: owner.id
    }
  });

  await prisma.organizationMember.createMany({
    data: [
      {
        organizationId: organization.id,
        userId: owner.id,
        role: Role.OWNER
      },
      {
        organizationId: organization.id,
        userId: agent.id,
        role: Role.AGENT
      },
      {
        organizationId: organization.id,
        userId: customer.id,
        role: Role.CUSTOMER
      }
    ]
  });

  console.log("Seed completed successfully");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });