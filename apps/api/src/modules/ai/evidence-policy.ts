import type { Selected, SearchStatus } from "../knowledge-base/kb.retrieval.js";
export const POLICY_LIMITS = { semanticStrong: 0.82, semanticAgreement: 0.65, lexicalCoverage: 0.6, agreementCoverage: 0.35 } as const;
export type EvidenceDecision = "ANSWER_SUPPORTED" | "NEEDS_CUSTOMER_INFO" | "INSUFFICIENT_KNOWLEDGE" | "CONFLICTING_KNOWLEDGE" | "RETRIEVAL_DEGRADED";
export function supportsAnswer(row: Selected) {
    return (row.semanticScore ?? -1) >= POLICY_LIMITS.semanticStrong ||
        ((row.lexicalCoverage ?? 0) >= POLICY_LIMITS.lexicalCoverage && row.lexicalRank !== null) ||
        ((row.semanticScore ?? -1) >= POLICY_LIMITS.semanticAgreement && (row.lexicalCoverage ?? 0) >= POLICY_LIMITS.agreementCoverage);
}
export function evaluateEvidence(rows: Selected[], health: {
    semanticStatus: SearchStatus;
    lexicalStatus: SearchStatus;
}, customerContext: string) {
    const selectedEvidence = rows.filter(supportsAnswer);
    const degraded = (health.semanticStatus !== "OK" && health.semanticStatus !== "DISABLED") || health.lexicalStatus !== "OK";
    const warnings = degraded ? ["Knowledge retrieval has reduced coverage; inspect the selected sources."] : [];
    const missingInformation: string[] = [];
    let decision: EvidenceDecision = "ANSWER_SUPPORTED";
    let reason = "Direct lexical coverage or strong semantic support satisfies the evidence rules.";
    if (!selectedEvidence.length) {
        decision = degraded ? "RETRIEVAL_DEGRADED" : "INSUFFICIENT_KNOWLEDGE";
        reason = degraded ? "Retrieval coverage is incomplete and no sufficient evidence was found." : "Search completed without sufficiently relevant knowledge.";
    }
    else {
        // Narrow, conservative conflict detector: explicit refund windows in days across documents.
        // Other policy contradictions require human review; no generic semantic claim is made.
        const windows = selectedEvidence.flatMap(row => [...row.content.matchAll(/refund(?:s)? (?:are available |is available )?(?:within|window(?: is|:)?|period(?: is|:)?)\s*(\d+)\s*days/gi)].map(m => ({ documentId: row.documentId, value: Number(m[1]) })));
        const conflict = windows.some(a => windows.some(b => a.documentId !== b.documentId && a.value !== b.value));
        if (conflict) {
            decision = "CONFLICTING_KNOWLEDGE";
            reason = "Selected documents specify different explicit refund windows; an agent must resolve the conflict.";
        }
        else {
            const evidence = selectedEvidence.map(r => r.content).join("\n");
            const requirement = /\b(?:require|required|requires|must provide)\b[^.\n]{0,160}/gi;
            const requirements = evidence.match(requirement)?.join(" ") ?? "";
            if (/order (?:number|id)/i.test(requirements) && !/(?:order (?:number|id)|order #)\s*[:#-]?\s*[a-z0-9]*\d[a-z0-9-]*/i.test(customerContext))
                missingInformation.push("Order number");
            if (/purchase date/i.test(requirements) && !/(?:purchased|purchase date|bought)\s*(?:on|:)?\s*(?:\d{4}-\d{2}-\d{2}|\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|[a-z]+ \d{1,2})/i.test(customerContext))
                missingInformation.push("Purchase date");
            if (missingInformation.length) {
                decision = "NEEDS_CUSTOMER_INFO";
                reason = "Knowledge is available, but required customer facts are missing: " + missingInformation.join(", ") + ".";
            }
        }
    }
    const evidenceLevel = selectedEvidence.length ? (selectedEvidence.some(r => (r.semanticScore ?? -1) >= POLICY_LIMITS.semanticAgreement && (r.lexicalCoverage ?? 0) >= POLICY_LIMITS.agreementCoverage) ? "STRONG" : "LIMITED") : "INSUFFICIENT";
    return { decision, reason, evidenceLevel, selectedEvidence, missingInformation, warnings, generationAllowed: decision === "ANSWER_SUPPORTED",
        uniqueDocumentCount: new Set(selectedEvidence.map(r => r.documentId)).size, selectedChunkCount: selectedEvidence.length };
}
