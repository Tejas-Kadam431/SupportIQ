import { GoogleGenAI } from "@google/genai";
import OpenAI from "openai";
import { prisma } from "../../config/prisma.js";
import { env } from "../../config/env.js";
import { AppError } from "../../common/errors/AppError.js";
import { getTicketOrThrow } from "../tickets/ticket.service.js";
import { searchKnowledgeBase } from "../knowledge-base/kb.service.js";
import type {
  EvaluateCopilotInput,
  GenerateAiDraftInput
} from "./ai.schema.js";
import { isDemoReadonlyUserId } from "../../common/middleware/demoReadOnly.middleware.js";

type Role = "OWNER" | "ADMIN" | "AGENT" | "CUSTOMER";
type SearchMode = "semantic" | "keyword";
type AiProvider = "gemini" | "openai" | "fallback";

type AiDraftSource = {
  chunkId: string;
  documentId: string;
  documentName: string;
  chunkIndex: number;
  score: number;
  citationLabel: string;
  searchType: SearchMode;
  excerpt: string;
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
  return `${ticket.title} ${ticket.description}`.trim().slice(0, 700);
}

function trimContent(content: string, maxLength = 1200) {
  if (content.length <= maxLength) {
    return content;
  }

  return `${content.slice(0, maxLength).trim()}...`;
}

function buildExcerpt(content: string, maxLength = 420) {
  const normalized = content.trim().replace(/\s+/g, " ");

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength).trim()}...`;
}

function buildKnowledgeContext(sources: AiDraftSource[]) {
  if (sources.length === 0) {
    return "No relevant knowledge-base context was found.";
  }

  return sources
    .map((source) =>
      [
        `[${source.citationLabel}] Document: ${source.documentName}`,
        `Chunk: ${source.chunkIndex + 1}`,
        `Search type: ${source.searchType}`,
        `Relevance score: ${source.score}`,
        "",
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

  if (sources.length >= 2 && bestScore >= 70) {
    return "HIGH" as const;
  }

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
  provider: AiProvider;
  fallbackReason?: string;
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

  if (args.provider === "fallback") {
    warnings.push(
      args.fallbackReason ??
        "No external AI provider is configured, so SupportIQ generated a safe fallback draft."
    );
  }

  return warnings;
}
function buildCopilotInsights(
  ticket: {
    title: string;
    description: string;
  },
  confidence: "LOW" | "MEDIUM" | "HIGH",
  sources: AiDraftSource[]
) {
  const abstained = sources.length === 0 || confidence === "LOW";

  const missingInformation: string[] = [];

  if (sources.length === 0) {
    missingInformation.push(
      "Verified knowledge-base evidence for this issue."
    );
  } else if (confidence === "LOW") {
    missingInformation.push(
      "Stronger or more directly relevant knowledge-base evidence."
    );
  }

  const issueSummary = [
    ticket.title,
    trimContent(ticket.description, 320)
  ]
    .filter(Boolean)
    .join(": ");

  const recommendedAction = abstained
    ? "Ask for any missing customer context and verify the relevant knowledge-base guidance before sending a definitive answer."
    : "Review the retrieved evidence and suggested reply, edit it if necessary, then send it after confirming it matches the customer context.";

  return {
    topic: ticket.title.trim().slice(0, 100),
    issueSummary,
    missingInformation,
    recommendedAction,
    abstained
  };
}

function extractActionLines(sources: AiDraftSource[]) {
  const lines = sources
    .flatMap((source) => source.content.split("\n"))
    .map((line) => line.trim())
    .filter((line) => /^\d+\./.test(line))
    .slice(0, 4);

  return lines;
}

function buildFallbackDraft(
  ticket: {
    title: string;
    description: string;
  },
  tone: GenerateAiDraftInput["tone"],
  sources: AiDraftSource[]
) {
  const actionLines = extractActionLines(sources);

  if (actionLines.length > 0) {
    const intro =
      tone === "FRIENDLY"
        ? `Thanks for reaching out about "${ticket.title}". I’m sorry you’re running into this.`
        : `Thank you for contacting us regarding "${ticket.title}".`;

    const closing =
      tone === "CONCISE"
        ? "Please try these steps and let us know if the issue continues."
        : "Please try these steps and let us know what happens. If the issue continues, we’ll review it further and help you resolve it.";

    return [
      "Hi,",
      "",
      intro,
      "",
      "Based on our support guidance, please try the following:",
      "",
      ...actionLines.map((line) => `- ${line.replace(/^\d+\.\s*/, "")}`),
      "",
      closing,
      "",
      "Best regards,",
      "Support Team"
    ].join("\n");
  }

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

function getGeminiClient() {
  if (!env.GEMINI_API_KEY) {
    return null;
  }

  return new GoogleGenAI({
    apiKey: env.GEMINI_API_KEY
  });
}

function buildAiPrompt(args: {
  ticketDetails: {
    title: string;
    description: string;
    status: string;
    priority: string;
    customer: {
      name: string;
    };
  };
  recentMessages: string;
  sources: AiDraftSource[];
  toneInstruction: string;
}) {
  return [
    "You are a careful customer support agent.",
    "Write a helpful, accurate customer-facing support reply.",
    "Do not invent policies, refunds, timelines, discounts, or technical facts.",
    "Use the knowledge-base context only when relevant.",
    "If the answer is uncertain, ask for more information instead of making claims.",
    "The source labels like [S1] are internal citations for the support agent.",
    "Do not include source labels in the final customer-facing reply.",
    args.toneInstruction,
    "",
    `Customer name: ${args.ticketDetails.customer.name}`,
    `Ticket title: ${args.ticketDetails.title}`,
    `Ticket description: ${args.ticketDetails.description}`,
    `Ticket status: ${args.ticketDetails.status}`,
    `Ticket priority: ${args.ticketDetails.priority}`,
    "",
    "Recent conversation:",
    args.recentMessages || "No messages yet.",
    "",
    "Knowledge-base context with internal source labels:",
    buildKnowledgeContext(args.sources),
    "",
    "Write only the final customer-facing reply. Do not mention internal scores or source labels."
  ].join("\n");
}

async function generateWithGemini(prompt: string) {
  const gemini = getGeminiClient();

  if (!gemini) {
    return null;
  }

  const response = await gemini.models.generateContent({
    model: env.GEMINI_MODEL,
    contents: prompt
  });

  const text = response.text?.trim();

  if (!text) {
    throw new Error("Gemini returned an empty response");
  }

  return text;
}

async function generateWithOpenAI(prompt: string, toneInstruction: string) {
  const openai = getOpenAIClient();

  if (!openai) {
    return null;
  }

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
          "The source labels like [S1] are internal citations for the support agent.",
          "Do not include source labels in the final customer-facing reply.",
          toneInstruction
        ].join(" ")
      },
      {
        role: "user",
        content: prompt
      }
    ]
  });

  const text = completion.choices[0]?.message?.content?.trim();

  if (!text) {
    throw new Error("OpenAI returned an empty response");
  }

  return text;
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

  const searchMode = kbSearch.mode as SearchMode;

  const sources: AiDraftSource[] = kbSearch.results.map((result, index) => ({
    chunkId: result.id,
    documentId: result.documentId,
    documentName: result.document.originalName,
    chunkIndex: result.chunkIndex,
    score: Number(result.score),
    citationLabel: `S${index + 1}`,
    searchType: (result.searchType ?? searchMode) as SearchMode,
    excerpt: buildExcerpt(result.content),
    content: result.content
  }));

  const confidence = calculateConfidence(sources);
  const toneInstruction = getToneInstruction(input.tone);

  const recentMessages = ticketDetails.messages
    .map((message) => `${message.sender.name}: ${message.body}`)
    .join("\n");

  const prompt = buildAiPrompt({
    ticketDetails,
    recentMessages,
    sources,
    toneInstruction
  });

  let draft = "";
  let provider: AiProvider = "fallback";
  let fallbackReason: string | undefined;

  try {
    const geminiDraft = await generateWithGemini(prompt);

    if (geminiDraft) {
      draft = geminiDraft;
      provider = "gemini";
    }
  } catch (error) {
    console.error("Gemini draft generation failed:", error);
    fallbackReason =
      "Gemini generation failed, so SupportIQ generated a safe fallback draft.";
  }

  if (!draft) {
    try {
      const openAiDraft = await generateWithOpenAI(prompt, toneInstruction);

      if (openAiDraft) {
        draft = openAiDraft;
        provider = "openai";
        fallbackReason = undefined;
      }
    } catch (error) {
      console.error("OpenAI draft generation failed:", error);
      fallbackReason =
        "External AI generation failed, so SupportIQ generated a safe fallback draft.";
    }
  }

  if (!draft) {
    draft = buildFallbackDraft(ticketDetails, input.tone, sources);

    if (!fallbackReason) {
      fallbackReason =
        "No external AI provider is configured, so SupportIQ generated a safe fallback draft.";
    }
  }

  const warnings = buildWarnings({
    sourceCount: sources.length,
    confidence,
    ticketStatus: ticketDetails.status,
    provider,
    fallbackReason
  });
    const copilot = buildCopilotInsights(
    ticketDetails,
    confidence,
    sources
  );

  const suggestedReply = copilot.abstained
    ? null
    : draft;
  const shouldWriteActivity = !(await isDemoReadonlyUserId(userId));
  let runId: string | null = null;

  if (shouldWriteActivity) {
    const run = await prisma.copilotRun.create({
    data: {
      organizationId: ticketDetails.organizationId,
      ticketId: ticketDetails.id,
      triggeredById: userId,

      provider,
      confidence,
      tone: input.tone,

      topic: copilot.topic,
      issueSummary: copilot.issueSummary,
      missingInformation: copilot.missingInformation,
      recommendedAction: copilot.recommendedAction,
      suggestedReply,
      abstained: copilot.abstained,

      searchQuery,
      searchMode,
      sourceCount: sources.length,

      sources: sources.map((source) => ({
        citationLabel: source.citationLabel,
        documentId: source.documentId,
        documentName: source.documentName,
        chunkId: source.chunkId,
        chunkIndex: source.chunkIndex,
        score: source.score,
        searchType: source.searchType,
        excerpt: source.excerpt
      })),

      warnings
    }
  });

  runId = run.id;
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
          searchMode,
          confidence,
          warnings,
          tone: input.tone,
          sources: sources.map((source) => ({
            citationLabel: source.citationLabel,
            documentId: source.documentId,
            documentName: source.documentName,
            chunkId: source.chunkId,
            chunkIndex: source.chunkIndex,
            score: source.score,
            searchType: source.searchType
          }))
        }
      }
    });
  }

  return {
    runId,

    topic: copilot.topic,
    issueSummary: copilot.issueSummary,
    missingInformation: copilot.missingInformation,
    recommendedAction: copilot.recommendedAction,

    suggestedReply,
    abstained: copilot.abstained,

    // Keep this temporarily for backward compatibility.
    draft: suggestedReply ?? "",

    provider,
    confidence,
    warnings,
    tone: input.tone,

    grounding: {
      searchQuery,
      searchMode,
      sourceCount: sources.length,
      hasKnowledgeContext: sources.length > 0
    },

    sources,

    ticket: {
      id: ticketDetails.id,
      title: ticketDetails.title,
      status: ticketDetails.status,
      priority: ticketDetails.priority
    }
  };
}
export async function evaluateCopilotRun(
  userId: string,
  ticketId: string,
  runId: string,
  input: EvaluateCopilotInput
) {
  const { ticket, membership } = await getTicketOrThrow(
    userId,
    ticketId
  );

  const role = membership.role as Role;

  assertStaffRole(role);

  const run = await prisma.copilotRun.findFirst({
    where: {
      id: runId,
      ticketId: ticket.id,
      organizationId: ticket.organizationId
    }
  });

  if (!run) {
    throw new AppError("Copilot run not found", 404);
  }

  const finalMessage =
    input.finalMessage?.trim() || null;

  const reason =
    input.disposition === "ACCEPTED"
      ? null
      : input.reason ?? null;

  return prisma.copilotEvaluation.upsert({
    where: {
      copilotRunId: run.id
    },

    update: {
      evaluatorId: userId,
      disposition: input.disposition,
      reason,
      finalMessage
    },

    create: {
      copilotRunId: run.id,
      evaluatorId: userId,
      disposition: input.disposition,
      reason,
      finalMessage
    }
  });
}