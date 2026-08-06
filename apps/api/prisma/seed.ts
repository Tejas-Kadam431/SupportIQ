import {
  ActivityType,
  KnowledgeDocumentStatus,
  PrismaClient,
  Role,
  TicketPriority,
  TicketStatus
} from "@prisma/client";
import { hashPassword } from "../src/common/utils/password.js";

const prisma = new PrismaClient();

function hoursAgo(hours: number) {
  return new Date(Date.now() - hours * 60 * 60 * 1000);
}

async function resetDatabase() {
  await prisma.activityLog.deleteMany();
  await prisma.internalNote.deleteMany();
  await prisma.ticketMessage.deleteMany();
  await prisma.ticket.deleteMany();
  await prisma.knowledgeChunk.deleteMany();
  await prisma.knowledgeDocument.deleteMany();
  await prisma.organizationMember.deleteMany();
  await prisma.organization.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.user.deleteMany();
}

async function main() {
  await resetDatabase();

  const passwordHash = await hashPassword("password123");

  const owner = await prisma.user.create({
    data: {
      name: "Demo Owner",
      email: "demo.owner@supportiq.app",
      passwordHash
    }
  });

  const admin = await prisma.user.create({
    data: {
      name: "Priya Sharma",
      email: "priya.admin@supportiq.app",
      passwordHash
    }
  });

  const agent = await prisma.user.create({
    data: {
      name: "Rahul Verma",
      email: "rahul.agent@supportiq.app",
      passwordHash
    }
  });

  const customerA = await prisma.user.create({
    data: {
      name: "Aarav Mehta",
      email: "aarav.customer@example.com",
      passwordHash
    }
  });

  const customerB = await prisma.user.create({
    data: {
      name: "Neha Kapoor",
      email: "neha.customer@example.com",
      passwordHash
    }
  });

  const organization = await prisma.organization.create({
    data: {
      name: "AcmeCloud Support",
      slug: "acmecloud-support",
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
        userId: admin.id,
        role: Role.ADMIN
      },
      {
        organizationId: organization.id,
        userId: agent.id,
        role: Role.AGENT
      },
      {
        organizationId: organization.id,
        userId: customerA.id,
        role: Role.CUSTOMER
      },
      {
        organizationId: organization.id,
        userId: customerB.id,
        role: Role.CUSTOMER
      }
    ]
  });

  const passwordTicket = await prisma.ticket.create({
    data: {
      organizationId: organization.id,
      customerId: customerA.id,
      assigneeId: agent.id,
      title: "Password reset email is not arriving",
      description:
        "Customer is trying to reset their password but the reset email is not showing up in inbox or spam folder.",
      status: TicketStatus.WAITING,
      priority: TicketPriority.HIGH,
      firstResponseAt: hoursAgo(21),
      createdAt: hoursAgo(24)
    }
  });

  const invoiceTicket = await prisma.ticket.create({
    data: {
      organizationId: organization.id,
      customerId: customerB.id,
      assigneeId: agent.id,
      title: "Need invoice with company GST details",
      description:
        "Customer needs to download the latest invoice and update company billing details before sharing it with finance.",
      status: TicketStatus.OPEN,
      priority: TicketPriority.MEDIUM,
      createdAt: hoursAgo(18)
    }
  });

  const twoFactorTicket = await prisma.ticket.create({
    data: {
      organizationId: organization.id,
      customerId: customerA.id,
      assigneeId: admin.id,
      title: "Locked out after losing two-factor authentication device",
      description:
        "Customer lost access to their authenticator app and cannot complete login because two-factor authentication is enabled.",
      status: TicketStatus.IN_PROGRESS,
      priority: TicketPriority.URGENT,
      firstResponseAt: hoursAgo(10),
      createdAt: hoursAgo(12)
    }
  });

  const refundTicket = await prisma.ticket.create({
    data: {
      organizationId: organization.id,
      customerId: customerB.id,
      assigneeId: agent.id,
      title: "Refund request after annual plan renewal",
      description:
        "Customer was charged for annual renewal yesterday and is asking if a refund is possible under the billing policy.",
      status: TicketStatus.RESOLVED,
      priority: TicketPriority.HIGH,
      firstResponseAt: hoursAgo(36),
      resolvedAt: hoursAgo(6),
      createdAt: hoursAgo(40)
    }
  });

  const apiTicket = await prisma.ticket.create({
    data: {
      organizationId: organization.id,
      customerId: customerA.id,
      assigneeId: null,
      title: "API import is failing because of rate limits",
      description:
        "Customer is importing a large CSV through the API and is receiving rate limit errors during bulk sync.",
      status: TicketStatus.OPEN,
      priority: TicketPriority.LOW,
      createdAt: hoursAgo(5)
    }
  });

  await prisma.ticketMessage.createMany({
    data: [
      {
        ticketId: passwordTicket.id,
        senderId: customerA.id,
        body: "I requested a password reset link multiple times, but I still have not received any email.",
        createdAt: hoursAgo(24)
      },
      {
        ticketId: passwordTicket.id,
        senderId: agent.id,
        body: "Thanks for reporting this. Please check spam and confirm whether your email address is spelled correctly on the login page.",
        createdAt: hoursAgo(21)
      },
      {
        ticketId: passwordTicket.id,
        senderId: customerA.id,
        body: "I checked spam and the email address is correct. Still nothing.",
        createdAt: hoursAgo(20)
      },
      {
        ticketId: invoiceTicket.id,
        senderId: customerB.id,
        body: "Can you help me download the invoice for our latest payment and add company GST details?",
        createdAt: hoursAgo(18)
      },
      {
        ticketId: twoFactorTicket.id,
        senderId: customerA.id,
        body: "I lost my phone and cannot access the authenticator app. I am locked out of my account.",
        createdAt: hoursAgo(12)
      },
      {
        ticketId: twoFactorTicket.id,
        senderId: admin.id,
        body: "We can help after verifying account ownership. Please share your workspace name and last successful login date.",
        createdAt: hoursAgo(10)
      },
      {
        ticketId: refundTicket.id,
        senderId: customerB.id,
        body: "Our annual plan renewed yesterday. Can we cancel and get a refund?",
        createdAt: hoursAgo(40)
      },
      {
        ticketId: refundTicket.id,
        senderId: agent.id,
        body: "Your request has been reviewed. Since it is within the eligible refund window, we have initiated the refund process.",
        createdAt: hoursAgo(6)
      },
      {
        ticketId: apiTicket.id,
        senderId: customerA.id,
        body: "Our bulk import is failing with rate limit errors. We are sending around 5000 requests quickly.",
        createdAt: hoursAgo(5)
      }
    ]
  });

  await prisma.internalNote.createMany({
    data: [
      {
        ticketId: passwordTicket.id,
        authorId: agent.id,
        body: "Likely email delivery or suppression issue. Ask customer to confirm domain and try one more reset after 10 minutes.",
        createdAt: hoursAgo(19)
      },
      {
        ticketId: twoFactorTicket.id,
        authorId: admin.id,
        body: "High priority because customer is locked out. Require ownership verification before disabling 2FA.",
        createdAt: hoursAgo(9)
      },
      {
        ticketId: refundTicket.id,
        authorId: agent.id,
        body: "Refund approved because request came within 7 days of annual renewal.",
        createdAt: hoursAgo(7)
      }
    ]
  });

  const passwordDoc = await prisma.knowledgeDocument.create({
    data: {
      organizationId: organization.id,
      uploadedById: owner.id,
      fileName: "password-reset-guide.md",
      originalName: "Password Reset Troubleshooting Guide.md",
      mimeType: "text/markdown",
      sizeBytes: 2450,
      storagePath: "/tmp/supportiq-demo/password-reset-guide.md",
      status: KnowledgeDocumentStatus.READY,
      chunks: {
        create: [
          {
            organizationId: organization.id,
            chunkIndex: 0,
            tokenCount: 132,
            content:
              "Password reset troubleshooting: If a customer does not receive a password reset email, ask them to check spam, promotions, and blocked sender lists. Confirm the customer entered the correct email address. Password reset links can take up to 10 minutes during high email queue load."
          },
          {
            organizationId: organization.id,
            chunkIndex: 1,
            tokenCount: 118,
            content:
              "If the password reset email is still not arriving after 10 minutes, create an internal note and escalate to the support lead. Do not manually change the customer password. Ask the customer to confirm their workspace name and account email before escalation."
          }
        ]
      }
    }
  });

  const billingDoc = await prisma.knowledgeDocument.create({
    data: {
      organizationId: organization.id,
      uploadedById: owner.id,
      fileName: "billing-refund-policy.txt",
      originalName: "Billing and Refund Policy.txt",
      mimeType: "text/plain",
      sizeBytes: 3120,
      storagePath: "/tmp/supportiq-demo/billing-refund-policy.txt",
      status: KnowledgeDocumentStatus.READY,
      chunks: {
        create: [
          {
            organizationId: organization.id,
            chunkIndex: 0,
            tokenCount: 126,
            content:
              "Invoices are available from Workspace Settings > Billing > Invoices. Customers can download invoices for successful payments. Company name, billing email, address, and GST or tax details can be updated from the billing profile before future invoices are generated."
          },
          {
            organizationId: organization.id,
            chunkIndex: 1,
            tokenCount: 136,
            content:
              "Refund policy: Monthly subscriptions are generally non-refundable after the billing period starts. Annual renewals may be refunded if the request is made within 7 days of renewal and there has been no significant product usage after renewal. Support agents should confirm account ownership before discussing billing changes."
          }
        ]
      }
    }
  });

  const securityDoc = await prisma.knowledgeDocument.create({
    data: {
      organizationId: organization.id,
      uploadedById: owner.id,
      fileName: "account-security-2fa.md",
      originalName: "Account Security and 2FA Guide.md",
      mimeType: "text/markdown",
      sizeBytes: 2800,
      storagePath: "/tmp/supportiq-demo/account-security-2fa.md",
      status: KnowledgeDocumentStatus.READY,
      chunks: {
        create: [
          {
            organizationId: organization.id,
            chunkIndex: 0,
            tokenCount: 142,
            content:
              "Two-factor authentication recovery: If a customer loses access to their authenticator app, support must verify account ownership before disabling 2FA. Ask for workspace name, account email, recent invoice ID, and last successful login date. Do not disable 2FA without verification."
          },
          {
            organizationId: organization.id,
            chunkIndex: 1,
            tokenCount: 104,
            content:
              "After ownership is verified, an admin may temporarily disable 2FA and ask the customer to log in, reset their authenticator app, and create new backup codes. Mention that backup codes should be stored securely."
          }
        ]
      }
    }
  });

  const apiDoc = await prisma.knowledgeDocument.create({
    data: {
      organizationId: organization.id,
      uploadedById: owner.id,
      fileName: "api-rate-limits.txt",
      originalName: "API Usage and Rate Limits.txt",
      mimeType: "text/plain",
      sizeBytes: 2100,
      storagePath: "/tmp/supportiq-demo/api-rate-limits.txt",
      status: KnowledgeDocumentStatus.READY,
      chunks: {
        create: [
          {
            organizationId: organization.id,
            chunkIndex: 0,
            tokenCount: 120,
            content:
              "API rate limits: Standard workspaces allow 600 requests per minute. Bulk imports should use batching with exponential backoff. If a customer receives rate limit errors, recommend reducing request concurrency and retrying failed requests after a short delay."
          },
          {
            organizationId: organization.id,
            chunkIndex: 1,
            tokenCount: 100,
            content:
              "For large imports, customers should send data in batches of 100 to 250 records and wait between batches. Support can suggest using the CSV import dashboard instead of direct API calls for very large migrations."
          }
        ]
      }
    }
  });

  await prisma.activityLog.createMany({
    data: [
      {
        organizationId: organization.id,
        ticketId: passwordTicket.id,
        actorId: customerA.id,
        type: ActivityType.TICKET_CREATED,
        message: "Ticket created: Password reset email is not arriving",
        metadata: {
          priority: "HIGH",
          status: "WAITING"
        },
        createdAt: hoursAgo(24)
      },
      {
        organizationId: organization.id,
        ticketId: passwordTicket.id,
        actorId: agent.id,
        type: ActivityType.TICKET_ASSIGNED,
        message: "Ticket assigned to Rahul Verma",
        metadata: {
          assigneeEmail: agent.email
        },
        createdAt: hoursAgo(23)
      },
      {
        organizationId: organization.id,
        ticketId: passwordTicket.id,
        actorId: agent.id,
        type: ActivityType.MESSAGE_SENT,
        message: "Agent replied to password reset ticket",
        metadata: {},
        createdAt: hoursAgo(21)
      },
      {
        organizationId: organization.id,
        ticketId: twoFactorTicket.id,
        actorId: admin.id,
        type: ActivityType.STATUS_CHANGED,
        message: "Status changed to IN_PROGRESS",
        metadata: {
          from: "OPEN",
          to: "IN_PROGRESS"
        },
        createdAt: hoursAgo(10)
      },
      {
        organizationId: organization.id,
        ticketId: refundTicket.id,
        actorId: agent.id,
        type: ActivityType.STATUS_CHANGED,
        message: "Status changed to RESOLVED",
        metadata: {
          from: "IN_PROGRESS",
          to: "RESOLVED"
        },
        createdAt: hoursAgo(6)
      },
      {
        organizationId: organization.id,
        ticketId: null,
        actorId: owner.id,
        type: ActivityType.DOCUMENT_UPLOADED,
        message: "Knowledge document uploaded: Password Reset Troubleshooting Guide.md",
        metadata: {
          documentId: passwordDoc.id,
          originalName: passwordDoc.originalName
        },
        createdAt: hoursAgo(4)
      },
      {
        organizationId: organization.id,
        ticketId: null,
        actorId: owner.id,
        type: ActivityType.DOCUMENT_UPLOADED,
        message: "Knowledge document uploaded: Billing and Refund Policy.txt",
        metadata: {
          documentId: billingDoc.id,
          originalName: billingDoc.originalName
        },
        createdAt: hoursAgo(3)
      },
      {
        organizationId: organization.id,
        ticketId: null,
        actorId: owner.id,
        type: ActivityType.DOCUMENT_UPLOADED,
        message: "Knowledge document uploaded: Account Security and 2FA Guide.md",
        metadata: {
          documentId: securityDoc.id,
          originalName: securityDoc.originalName
        },
        createdAt: hoursAgo(2)
      },
      {
        organizationId: organization.id,
        ticketId: null,
        actorId: owner.id,
        type: ActivityType.DOCUMENT_UPLOADED,
        message: "Knowledge document uploaded: API Usage and Rate Limits.txt",
        metadata: {
          documentId: apiDoc.id,
          originalName: apiDoc.originalName
        },
        createdAt: hoursAgo(1)
      }
    ]
  });

  console.log("Demo seed completed successfully");
  console.log("Demo login: demo.owner@supportiq.app / password123");
  console.log(`Organization: ${organization.name}`);
  console.log("Created demo tickets, messages, notes, activity logs, KB documents, and KB chunks.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });