import { contentHash } from "../../common/utils/contentHash.js";
export const CLASSIFIER_VERSION = "knowledge-signal-v1";
export const KNOWLEDGE_REASONS = ["WRONG_KNOWLEDGE", "INSUFFICIENT_KB", "IRRELEVANT_EVIDENCE", "UNSUPPORTED_CLAIM"] as const;
export const OPERATIONAL_STATUSES = ["EMBEDDING_FAILED", "VECTOR_FAILED", "LEXICAL_FAILED", "SCOPE_FAILED"];
export function record(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
export type SignalRun = {
    id?: string;
    topic: string;
    abstained: boolean;
    evidencePolicyVersion: string | null;
    outputSnapshot: unknown;
    providerMetadata?: unknown;
    sources: unknown;
    evaluation: {
        disposition: string;
        reason: string | null;
    } | null;
};
export function policyOutcome(run: SignalRun) { return run.evidencePolicyVersion === "evidence-v2" ? String(record(run.outputSnapshot).evidenceDecision ?? "UNKNOWN") : "LEGACY_UNKNOWN"; }
export function operationalFailure(run: SignalRun) {
    const metadata = record(run.providerMetadata), retrieval = record(metadata.retrieval);
    return policyOutcome(run) === "RETRIEVAL_DEGRADED" || [retrieval.semanticStatus, retrieval.lexicalStatus].some(v => OPERATIONAL_STATUSES.includes(String(v))) || (Array.isArray(metadata.attempts) && metadata.attempts.some(a => record(a).outcome === "FAILED"));
}
export function classifyKnowledgeFailure(run: SignalRun): string | null {
    const policy = policyOutcome(run);
    // Missing inputs and retrieval outages must not masquerade as KB defects.
    if (["NEEDS_CUSTOMER_INFO", "RETRIEVAL_DEGRADED"].includes(policy))
        return null;
    if (run.abstained && run.evidencePolicyVersion === "evidence-v2" && ["INSUFFICIENT_KNOWLEDGE", "CONFLICTING_KNOWLEDGE"].includes(policy))
        return policy;
    if (run.evaluation && run.evaluation.disposition !== "ACCEPTED" && KNOWLEDGE_REASONS.includes(run.evaluation.reason as typeof KNOWLEDGE_REASONS[number]))
        return run.evaluation.reason;
    // Legacy abstention alone and arbitrary edits are not reliable knowledge diagnoses.
    return null;
}
export type SourceIdentity = {
    documentId: string;
    documentVersionId: string;
    documentName: string;
    versionNumber: number;
};
export function selectedSources(value: unknown): SourceIdentity[] {
    const sources = new Map<string, SourceIdentity>();
    if (Array.isArray(value))
        for (const item of value) {
            const s = record(item);
            if (s.evidenceEligible !== true || typeof s.documentVersionId !== "string" || typeof s.documentId !== "string" || typeof s.versionNumber !== "number")
                continue;
            sources.set(s.documentVersionId, { documentId: s.documentId, documentVersionId: s.documentVersionId, documentName: typeof s.documentName === "string" ? s.documentName : "Knowledge document", versionNumber: s.versionNumber });
        }
    return [...sources.values()].sort((a, b) => a.documentVersionId.localeCompare(b.documentVersionId));
}
export function attributedVersions(reason: string | null, sources: SourceIdentity[]): string[] {
    // Multi-source blame is ambiguous. Unsupported claims concern output grounding;
    // missing knowledge does not establish that a retrieved document is incorrect.
    if (sources.length === 1 && ["WRONG_KNOWLEDGE", "IRRELEVANT_EVIDENCE"].includes(reason ?? ""))
        return [sources[0].documentVersionId];
    if (reason === "CONFLICTING_KNOWLEDGE")
        return sources.map(s => s.documentVersionId);
    return [];
}
export function normalizeTopic(topic: string) { return topic.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}._/-]+/gu, " ").replace(/\b(please|hello|hi|thanks)\b/g, " ").replace(/\s+/g, " ").trim().slice(0, 200); }
export function grouping(run: SignalRun, reason: string, sources: SourceIdentity[]) { const topic = normalizeTopic(run.topic); return { topic: topic || "Unclassified knowledge problem", key: contentHash(JSON.stringify([CLASSIFIER_VERSION, reason, topic || run.id, sources.map(s => s.documentVersionId)])) }; }
export function severity(tickets: number) { return tickets >= 6 ? "HIGH" : tickets >= 3 ? "MEDIUM" : "LOW"; }
