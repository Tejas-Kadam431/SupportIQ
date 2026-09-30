import { buildRetrievalQuery } from "../knowledge-base/kb.retrieval.js";
import type { HybridResult } from "../knowledge-base/kb.hybrid.js";
import { evaluateEvidence } from "./evidence-policy.js";
import { generateWithProviders } from "./ai.provider.js";
import { evidenceSnapshotSchema, contentHash, inputSnapshotSchema, captureContext } from "./ai.provenance.js";
import type { GenerateAiDraftInput } from "./ai.schema.js";
type SearchMode = "semantic" | "keyword" | "hybrid";
type AiProvider = "gemini" | "openai" | "fallback";
type AiDraftSource = {
    documentVersionId: string;
    versionNumber: number;
    publishedAt: string | null;
    chunkId: string;
    documentId: string;
    documentName: string;
    chunkIndex: number;
    score: number;
    citationLabel: string;
    searchType: SearchMode;
    excerpt: string;
    content: string;
    rank: number;
    contentHash: string;
    evidenceEligible: boolean;
    semanticRank: number | null;
    lexicalRank: number | null;
    semanticScore: number | null;
    lexicalScore: number | null;
    semanticDistance: number | null;
    lexicalCoverage: number;
    fusedScore: number;
    matchedBy: ("semantic" | "lexical")[];
};
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
        .map((source) => [
        `[${source.citationLabel}] Document: ${source.documentName}`,
        `Chunk: ${source.chunkIndex + 1}`,
        `Search type: ${source.searchType}`,
        `Relevance score: ${source.score}`,
        "",
        trimContent(source.content)
    ].join("\n"))
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
function extractActionLines(sources: AiDraftSource[]) {
    const lines = sources
        .flatMap((source) => source.content.split("\n"))
        .map((line) => line.trim())
        .filter((line) => /^\d+\./.test(line))
        .slice(0, 4);
    return lines;
}
function buildFallbackDraft(ticket: {
    title: string;
    description: string;
}, tone: GenerateAiDraftInput["tone"], sources: AiDraftSource[]) {
    const actionLines = extractActionLines(sources);
    if (actionLines.length > 0) {
        const intro = tone === "FRIENDLY"
            ? `Thanks for reaching out about "${ticket.title}". I’m sorry you’re running into this.`
            : `Thank you for contacting us regarding "${ticket.title}".`;
        const closing = tone === "CONCISE"
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
// No persistence, activity, decision, messaging or realtime imports. Retrieval is injected.
export async function evaluateCopilotContext(context: ReturnType<typeof captureContext>, input: GenerateAiDraftInput, retrieve: (query: string) => Promise<HybridResult>, allowGeneration = true, generate = generateWithProviders) {
    const generationTicket = { ...context.ticket, customer: { name: context.ticket.customerName } };
    const customerMessages = context.conversation.filter(message => message.isCustomer);
    const requestedQuery = buildRetrievalQuery(generationTicket, customerMessages.at(-1)?.content ?? "");
    const kbSearch = await retrieve(requestedQuery);
    const searchQuery = kbSearch.query;
    const searchMode = kbSearch.mode as SearchMode;
    const evidence = evaluateEvidence(kbSearch.selectedEvidence, kbSearch.diagnostics, [generationTicket.title, generationTicket.description, ...customerMessages.map(m => m.content)].join("\n"));
    const sources: AiDraftSource[] = kbSearch.selectedEvidence.map((result, index) => {
        const content = result.content.slice(0, 12000);
        return { documentVersionId: result.documentVersionId, versionNumber: result.versionNumber, publishedAt: result.publishedAt, evidenceEligible: evidence.selectedEvidence.some(row => row.id === result.id), chunkId: result.id, documentId: result.documentId, documentName: result.document.originalName.slice(0, 512),
            chunkIndex: result.chunkIndex, score: Number(result.score), citationLabel: `S${index + 1}`,
            searchType: (searchMode === "keyword" ? "keyword" : result.searchType ?? searchMode) as SearchMode, excerpt: buildExcerpt(content), content,
            rank: index + 1, contentHash: contentHash(content), semanticRank: result.semanticRank, lexicalRank: result.lexicalRank,
            semanticScore: result.semanticScore, lexicalScore: result.lexicalScore, semanticDistance: result.semanticDistance,
            lexicalCoverage: result.lexicalCoverage ?? 0, fusedScore: result.fusedScore, matchedBy: result.matchedBy };
    });
    evidenceSnapshotSchema.parse(sources);
    const inputSnapshot = inputSnapshotSchema.parse({ ...context, tone: input.tone, retrievalQuery: searchQuery });
    // Legacy enum compatibility only: evidence strength, never a probability.
    const confidence = evidence.evidenceLevel === "STRONG" ? "HIGH" : evidence.evidenceLevel === "LIMITED" ? "MEDIUM" : "LOW";
    const toneInstruction = getToneInstruction(input.tone);
    const recentMessages = context.conversation
        .map((message) => `${message.senderName}: ${message.content}`)
        .join("\n");
    const prompt = buildAiPrompt({
        ticketDetails: generationTicket,
        recentMessages,
        sources: sources.filter(source => source.evidenceEligible),
        toneInstruction
    });
    const generation = allowGeneration && evidence.generationAllowed ? await generate(prompt, toneInstruction) : {
        provider: "fallback" as const, model: null, draft: null, rawDraft: null, attempts: [], requests: [], fallbackReason: null
    };
    const provider = generation.provider;
    const draft = allowGeneration && evidence.generationAllowed ? generation.draft ?? buildFallbackDraft(generationTicket, input.tone, sources.filter(source => source.evidenceEligible)) : null;
    const fallbackReason = generation.fallbackReason === "PROVIDER_FAILURE"
        ? "External AI generation failed, so SupportIQ generated a safe fallback draft."
        : generation.fallbackReason ? "No external AI provider is configured, so SupportIQ generated a safe fallback draft." : undefined;
    const warnings = [...evidence.warnings, ...(fallbackReason ? [fallbackReason] : [])];
    const copilot = { topic: generationTicket.title.slice(0, 100), issueSummary: generationTicket.title + ": " + trimContent(generationTicket.description, 320),
        missingInformation: evidence.missingInformation, recommendedAction: evidence.reason, abstained: !evidence.generationAllowed };
    const suggestedReply = copilot.abstained
        ? null
        : draft;
    return { generationTicket, requestedQuery, kbSearch, searchQuery, searchMode, evidence, sources, inputSnapshot, confidence, prompt, generation, provider, draft, warnings, copilot, suggestedReply };
}
