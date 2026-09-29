import type { Candidate, SearchStatus } from "../../modules/knowledge-base/kb.retrieval.js";
import type { EvidenceDecision } from "../../modules/ai/evidence-policy.js";
export const row = (id: string, content = "Password reset from account settings", score = 0.9, coverage = 0, documentId = id): Candidate => ({ documentVersionId:documentId+"-v1",versionNumber:1,publishedAt:"2026-01-01T00:00:00Z",id, documentId, content, score, lexicalCoverage: coverage, chunkIndex: 0, tokenCount: 10, document: { originalName: id } });
type Fixture = {
    name: string;
    query: string;
    semantic: Candidate[];
    lexical: Candidate[];
    expected: EvidenceDecision;
    semanticStatus?: SearchStatus;
    lexicalStatus?: SearchStatus;
    customer?: string;
};
export const evidenceFixtures: Fixture[] = [
    { name: "exact policy", query: "password reset", semantic: [], lexical: [row("a", undefined, 0.1, 1)], expected: "ANSWER_SUPPORTED" },
    { name: "semantic paraphrase", query: "cannot sign in", semantic: [row("a", undefined, 0.9)], lexical: [], expected: "ANSWER_SUPPORTED" },
    { name: "lexical identifier embeddings miss", query: "ERR42", semantic: [row("b", "Unrelated", 0.2)], lexical: [row("a", "ERR42 restart service", 0.05, 1)], expected: "ANSWER_SUPPORTED" },
    { name: "semantic synonyms", query: "credential recovery", semantic: [row("a", undefined, 0.84)], lexical: [], expected: "ANSWER_SUPPORTED" },
    { name: "unrelated", query: "lifetime upgrades", semantic: [row("a", undefined, 0.2)], lexical: [], expected: "INSUFFICIENT_KNOWLEDGE" },
    { name: "superficial overlap", query: "free account upgrades", semantic: [row("a", undefined, 0.64)], lexical: [row("a", undefined, 5, 0.2)], expected: "INSUFFICIENT_KNOWLEDGE" },
    { name: "one good with junk", query: "password reset", semantic: [row("a", undefined, 0.86), row("b", "junk", 0.3)], lexical: [], expected: "ANSWER_SUPPORTED" },
    { name: "duplicates cannot strengthen weak", query: "free upgrades", semantic: [row("a", "junk", 0.64), row("b", "junk", 0.63)], lexical: [], expected: "INSUFFICIENT_KNOWLEDGE" },
    { name: "independent support", query: "password reset", semantic: [row("a"), row("b", "Password recovery", 0.87)], lexical: [row("a", undefined, 1, 1)], expected: "ANSWER_SUPPORTED" },
    { name: "conflicting refund windows", query: "refund window", semantic: [row("a", "Refund window is 30 days", 0.9), row("b", "Refund window is 60 days", 0.9)], lexical: [], expected: "CONFLICTING_KNOWLEDGE" },
    { name: "no documents", query: "refund", semantic: [], lexical: [], expected: "INSUFFICIENT_KNOWLEDGE" },
    { name: "embedding failure lexical success", query: "password", semantic: [], lexical: [row("a", undefined, 0.01, 1)], semanticStatus: "EMBEDDING_FAILED", expected: "ANSWER_SUPPORTED" },
    { name: "lexical failure semantic success", query: "password", semantic: [row("a")], lexical: [], lexicalStatus: "LEXICAL_FAILED", expected: "ANSWER_SUPPORTED" },
    { name: "both failed", query: "password", semantic: [], lexical: [], semanticStatus: "VECTOR_FAILED", lexicalStatus: "LEXICAL_FAILED", expected: "RETRIEVAL_DEGRADED" },
    { name: "missing required facts", query: "refund", semantic: [row("a", "Refunds require order number and purchase date.")], lexical: [], customer: "I want a refund", expected: "NEEDS_CUSTOMER_INFO" },
    { name: "facts supplied", query: "refund", semantic: [row("a", "Refunds require order number and purchase date.")], lexical: [], customer: "Order number 1234 purchased on 2026-01-01", expected: "ANSWER_SUPPORTED" },
    { name: "absent organization policy", query: "lifetime free upgrades", semantic: [row("a", "Password help", 0.4)], lexical: [], expected: "INSUFFICIENT_KNOWLEDGE" },
    { name: "ambiguous issue", query: "help", semantic: [row("a", undefined, 0.4)], lexical: [], expected: "INSUFFICIENT_KNOWLEDGE" },
    { name: "acronym", query: "SSO", semantic: [], lexical: [row("a", "SSO uses SAML", 0.2, 1)], expected: "ANSWER_SUPPORTED" },
    { name: "long noisy query still useful", query: "password reset " + "noise ".repeat(150), semantic: [row("a", undefined, 0.85)], lexical: [row("a", undefined, 0.2, 0.3)], expected: "ANSWER_SUPPORTED" },
    { name: "incomplete embeddings no evidence", query: "refund", semantic: [], lexical: [], semanticStatus: "INDEX_INCOMPLETE", expected: "RETRIEVAL_DEGRADED" },
    { name: "modalities agree near boundary", query: "reset account password", semantic: [row("a", undefined, 0.66)], lexical: [row("a", undefined, 0.1, 0.4)], expected: "ANSWER_SUPPORTED" },
    { name: "agreement below boundary", query: "reset account password", semantic: [row("a", undefined, 0.64)], lexical: [row("a", undefined, 0.1, 0.4)], expected: "INSUFFICIENT_KNOWLEDGE" },
    { name: "high lexical raw score low coverage", query: "unrelated policy", semantic: [], lexical: [row("a", undefined, 99999, 0.2)], expected: "INSUFFICIENT_KNOWLEDGE" },
    { name: "semantic boundary weak", query: "credential recovery", semantic: [row("a", undefined, 0.8)], lexical: [], expected: "INSUFFICIENT_KNOWLEDGE" },
    { name: "same document repeated window not independent conflict", query: "refund window", semantic: [row("a", "Refund window is 30 days", 0.9, 0, "doc"), row("b", "Refund window is 30 days. Contact support", 0.9, 0, "doc")], lexical: [], expected: "ANSWER_SUPPORTED" },
    { name: "lexical just below boundary", query: "password reset account", semantic: [], lexical: [row("a", undefined, 0.2, 0.55)], expected: "INSUFFICIENT_KNOWLEDGE" },
    { name: "lexical above boundary", query: "password reset account", semantic: [], lexical: [row("a", undefined, 0.2, 0.65)], expected: "ANSWER_SUPPORTED" },
    { name: "agreement coverage too weak", query: "password reset account", semantic: [row("a", undefined, 0.7)], lexical: [row("a", undefined, 0.2, 0.3)], expected: "INSUFFICIENT_KNOWLEDGE" },
    { name: "weak vector does not strengthen lexical", query: "password reset", semantic: [row("a", undefined, 0.1)], lexical: [row("a", undefined, 0.2, 1)], expected: "ANSWER_SUPPORTED" }
];
