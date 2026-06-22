import OpenAI from "openai";
import { prisma } from "../../config/prisma.js";
import { env } from "../../config/env.js";
import { AppError } from "../../common/errors/AppError.js";
import { getTicketOrThrow } from "../tickets/ticket.service.js";
import { searchKnowledgeBase } from "../knowledge-base/kb.service.js";

type Role = "OWNER" | "ADMIN" | "AGENT" | "CUSTOMER";

type AiDraftSource = {
  chunkId: string;
  documentId: string;
  documentName: string;
  chunkIndex: number;
  score: number;
  content: string;
};

function assertStaffRole(role: Role) {
  if (role === "CUSTOMER") {
    throw new AppError("Customers cannot generate AI drafts", 403);
  }
}

function buildSearchQuery(ticket: {
  title: string;
  description: string;
}) {
  return `${ticket.title} ${ticket.description}`.trim();
}

function buildKnowledgeContext(sources: AiDraftSource[]) {
  if (sources.length === 0) {
    return "No relevant knowledge-base context was found.";
  }

  return sources
    .map(
      (source, index) =>
        `Source ${index + 1}: ${source.documentName}\n${source.content}`
    )
    .join("\n\n---\n\n");
}

function buildFallbackDraft(ticket: {
  title: string;
  description: string;
}) {
  return [
    "Hi,",
    "",
    `Thanks for reaching out about: ${ticket.title}.`,
    "",
    "I understand the issue you described. We’re reviewing the details and will help you resolve this as soon as possible.",
    "",
    "Could you please share any additional screenshots, order IDs, account details, or exact error messages that may help us investigate faster?",
    "",
    "Best regards,",
    "Support Team"
  ].join("\n");
}

function getOpenAIClient() {
  if (!env.OPENAI_API_KEY) {
    return null;
  }

  return new OpenAI({
    apiKey: env.OPENAI_API_KEY
  });
}

export async function generateAiDraftReply(userId: string, ticketId: string) {
  const { ticket, membership } = await getTicketOrThrow(userId, ticketId);
  const role = membership.role as Role;

  assertStaffRole(role);

  const ticketDetails = await prisma.ticket.findUnique({
    where: {
      id: ticket.id
    },
    include: {
      customer: {
        select: {
          id: true,
          name: true,
          email: true
        }
      },
      assignee: {
        select: {
          id: true,
          name: true,
          email: true
        }
      },
      messages: {
        include: {
          sender: {
            select: {
              id: true,
              name: true,
              email: true
            }
          }
        },
        orderBy: {
          createdAt: "asc"
        },
        take: 10
      }
    }
  });

  if (!ticketDetails) {
    throw new AppError("Ticket not found", 404);
  }

  const searchQuery = buildSearchQuery(ticketDetails);

  const kbSearch = await searchKnowledgeBase(ticketDetails.organizationId, {
    q: searchQuery,
    limit: "5"
  });

  const sources: AiDraftSource[] = kbSearch.results.map((result) => ({
    chunkId: result.id,
    documentId: result.documentId,
    documentName: result.document.originalName,
    chunkIndex: result.chunkIndex,
    score: result.score,
    content: result.content
  }));

  const knowledgeContext = buildKnowledgeContext(sources);
  const openai = getOpenAIClient();

  let draft: string;
  let provider: "openai" | "fallback";

  if (!openai) {
    draft = buildFallbackDraft(ticketDetails);
    provider = "fallback";
  } else {
    const recentMessages = ticketDetails.messages
      .map(
        (message) =>
          `${message.sender.name}: ${message.body}`
      )
      .join("\n");

    const completion = await openai.chat.completions.create({
      model: env.OPENAI_MODEL,
      temperature: 0.3,
      messages: [
        {
          role: "system",
          content:
            "You are a helpful customer support agent. Write concise, accurate, empathetic replies. Use the provided knowledge-base context when relevant. Do not invent policies, refunds, timelines, or technical facts not present in the context."
        },
        {
          role: "user",
          content: [
            `Customer name: ${ticketDetails.customer.name}`,
            `Ticket title: ${ticketDetails.title}`,
            `Ticket description: ${ticketDetails.description}`,
            `Ticket status: ${ticketDetails.status}`,
            "",
            "Recent conversation:",
            recentMessages || "No messages yet.",
            "",
            "Knowledge-base context:",
            knowledgeContext,
            "",
            "Write a polished support reply. Keep it practical and avoid overpromising."
          ].join("\n")
        }
      ]
    });

    draft =
      completion.choices[0]?.message?.content?.trim() ??
      buildFallbackDraft(ticketDetails);

    provider = "openai";
  }

  await prisma.activityLog.create({
    data: {
      organizationId: ticketDetails.organizationId,
      ticketId: ticketDetails.id,
      actorId: userId,
      type: "AI_REPLY_GENERATED",
      message: `AI reply generated for ticket: ${ticketDetails.title}`,
      metadata: {
        provider,
        sourceCount: sources.length,
        searchQuery
      }
    }
  });

  return {
    draft,
    provider,
    sources,
    ticket: {
      id: ticketDetails.id,
      title: ticketDetails.title,
      status: ticketDetails.status,
      priority: ticketDetails.priority
    }
  };
}