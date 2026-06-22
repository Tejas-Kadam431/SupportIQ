import OpenAI from "openai";
import { prisma } from "../../config/prisma.js";
import { env } from "../../config/env.js";
import { AppError } from "../../common/errors/AppError.js";
import { getTicketOrThrow } from "../tickets/ticket.service.js";
import { searchKnowledgeBase } from "../knowledge-base/kb.service.js";
import type { GenerateAiDraftInput } from "./ai.schema.js";

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
  return `${ticket.title} ${ticket.description}`.trim().slice(0, 500);
}

function trimContent(content: string, maxLength = 1200) {
  if (content.length <= maxLength) {
    return content;
  }

  return `${content.slice(0, maxLength).trim()}...`;
}

function buildKnowledgeContext(sources: AiDraftSource[]) {
  if (sources.length === 0) {
    return "No relevant knowledge-base context was found.";
  }

  return sources
    .map(
      (source, index) =>
        [
          `Source ${index + 1}: ${source.documentName}`,
          `Score: ${source.score}`,
          trimContent(source.content)
        ].join("\n")
    )
    .join("\n\n---\n\n");
}

function getToneInstruction(tone: GenerateAiDraftInput["tone"]) {
  if (tone === "FRIENDLY") {
    return "Use a warm, friendly, reassuring tone while staying professional.";
  }

  if (tone === "CONCISE") {
    return "Use a concise tone. Keep the reply short, direct, and practical.";
  }

  return "Use a professional, clear, empathetic customer support tone.";
}

function calculateConfidence(sources: AiDraftSource[]) {
  if (sources.length === 0) {
    return "LOW" as const;
  }

  const bestScore = Math.max(...sources.map((source) => source.score));

  if (sources.length >= 3 && bestScore >= 10) {
    return "HIGH" as const;
  }

  if (sources.length >= 1 && bestScore >= 3) {
    return "MEDIUM" as const;
  }

  return "LOW" as const;
}

function buildWarnings(args: {
  sourceCount: number;
  confidence: "LOW" | "MEDIUM" | "HIGH";
  ticketStatus: string;
}) {
  const warnings: string[] = [];

  if (args.sourceCount === 0) {
    warnings.push("No matching knowledge-base sources were found.");
  }

  if (args.confidence === "LOW") {
    warnings.push("AI confidence is low. Review carefully before sending.");
  }

  if (args.ticketStatus === "RESOLVED" || args.ticketStatus === "CLOSED") {
    warnings.push("This ticket is already resolved or closed.");
  }

  return warnings;
}

function buildFallbackDraft(
  ticket: {
    title: string;
    description: string;
  },
  tone: GenerateAiDraftInput["tone"]
) {
  if (tone === "CONCISE") {
    return [
      "Hi,",
      "",
      `Thanks for reaching out about "${ticket.title}".`,
      "",
      "We’re reviewing the issue and will help you resolve it as soon as possible. Please share any relevant screenshots, order IDs, or error messages so we can investigate faster.",
      "",
      "Best regards,",
      "Support Team"
    ].join("\n");
  }

  if (tone === "FRIENDLY") {
    return [
      "Hi,",
      "",
      `Thanks for reaching out about "${ticket.title}". I’m sorry you’re facing this issue.`,
      "",
      "We’ll take a look and help you get this resolved. Could you please share any screenshots, account details, order IDs, or exact error messages that may help us investigate?",
      "",
      "Best regards,",
      "Support Team"
    ].join("\n");
  }

  return [
    "Hi,",
    "",
    `Thank you for contacting us regarding "${ticket.title}".`,
    "",
    "We understand the issue you described and will review the details carefully. To help us investigate faster, please share any relevant screenshots, order IDs, account details, or exact error messages.",
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

export async function generateAiDraftReply(
  userId: string,
  ticketId: string,
  input: GenerateAiDraftInput
) {
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

  const confidence = calculateConfidence(sources);

  const warnings = buildWarnings({
    sourceCount: sources.length,
    confidence,
    ticketStatus: ticketDetails.status
  });

  const knowledgeContext = buildKnowledgeContext(sources);
  const toneInstruction = getToneInstruction(input.tone);
  const openai = getOpenAIClient();

  let draft: string;
  let provider: "openai" | "fallback";

  if (!openai) {
    draft = buildFallbackDraft(ticketDetails, input.tone);
    provider = "fallback";
  } else {
    const recentMessages = ticketDetails.messages
      .map((message) => `${message.sender.name}: ${message.body}`)
      .join("\n");

    const completion = await openai.chat.completions.create({
      model: env.OPENAI_MODEL,
      temperature: 0.25,
      messages: [
        {
          role: "system",
          content: [
            "You are a careful customer support agent.",
            "Write helpful, accurate replies.",
            "Do not invent policies, refunds, timelines, discounts, or technical facts.",
            "Use the knowledge-base context only when relevant.",
            "If the answer is uncertain, ask for more information instead of making claims.",
            toneInstruction
          ].join(" ")
        },
        {
          role: "user",
          content: [
            `Customer name: ${ticketDetails.customer.name}`,
            `Ticket title: ${ticketDetails.title}`,
            `Ticket description: ${ticketDetails.description}`,
            `Ticket status: ${ticketDetails.status}`,
            `Ticket priority: ${ticketDetails.priority}`,
            "",
            "Recent conversation:",
            recentMessages || "No messages yet.",
            "",
            "Knowledge-base context:",
            knowledgeContext,
            "",
            "Write only the final customer-facing reply. Do not mention internal scores or source numbers."
          ].join("\n")
        }
      ]
    });

    draft =
      completion.choices[0]?.message?.content?.trim() ??
      buildFallbackDraft(ticketDetails, input.tone);

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
        searchQuery,
        confidence,
        warnings,
        tone: input.tone
      }
    }
  });

  return {
    draft,
    provider,
    confidence,
    warnings,
    tone: input.tone,
    sources,
    ticket: {
      id: ticketDetails.id,
      title: ticketDetails.title,
      status: ticketDetails.status,
      priority: ticketDetails.priority
    }
  };
}