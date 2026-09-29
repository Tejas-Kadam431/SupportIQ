import type { Baseline } from "./replay.schema.js";
export type ComparisonClass = "IMPROVED" | "UNCHANGED" | "REGRESSED" | "INCONCLUSIVE" | "ERROR";
type Candidate = {
    decision: string;
    sources: Array<{
        documentVersionId: string;
        documentId: string;
        evidenceEligible: boolean;
        lexicalCoverage?: number;
    }>;
    operationalError: boolean;
};
export function compareCase(b: Baseline, c: Candidate, kind: string, intended: string[]) {
    const before = [...new Set(b.sources.filter(s => s.evidenceEligible).map(s => s.documentVersionId))].sort(), after = [...new Set(c.sources.filter(s => s.evidenceEligible).map(s => s.documentVersionId))].sort();
    const added = after.filter(v => !before.includes(v)), removed = before.filter(v => !after.includes(v)), overlap = after.filter(v => before.includes(v));
    let classification: ComparisonClass = "INCONCLUSIVE", reason = "No automatic correctness criterion exists for this case.";
    const supported = c.decision === 'ANSWER_SUPPORTED', targeted = intended.some(v => after.includes(v));
    if (c.operationalError) {
        classification = "ERROR";
        reason = "Operational failure; no quality conclusion.";
    }
    else if (kind === 'GUARDRAIL') {
        classification = b.decision === 'ANSWER_SUPPORTED' ? (supported ? 'UNCHANGED' : 'REGRESSED') : 'INCONCLUSIVE';
        reason = supported ? 'Historically accepted case remains evidence-supported; correctness is not established.' : 'Previously supported guardrail lost evidence support.';
    }
    else if (b.decision === 'ANSWER_SUPPORTED' && !supported) {
        classification = 'REGRESSED';
        reason = 'Supported baseline now abstains.';
    }
    else if (kind === 'FAILURE') {
        const issueReason = b.issueReason ?? b.reason ?? b.decision;
        if (['INSUFFICIENT_KNOWLEDGE', 'INSUFFICIENT_KB', 'CONFLICTING_KNOWLEDGE'].includes(String(issueReason))) {
            classification = supported && targeted ? 'IMPROVED' : c.decision === b.decision ? 'UNCHANGED' : 'INCONCLUSIVE';
            reason = 'Requires supported evidence from an intended version; conflict rules only detect explicit refund-window contradictions.';
        }
        else if (['WRONG_KNOWLEDGE', 'IRRELEVANT_EVIDENCE'].includes(String(issueReason))) {
            const excludes = before.length > 0 && before.every(v => !after.includes(v));
            const direct = c.sources.some(s => intended.includes(s.documentVersionId) && s.evidenceEligible && (s.lexicalCoverage ?? 0) >= 0.6);
            classification = supported && targeted && excludes && (issueReason !== 'IRRELEVANT_EVIDENCE' || direct) ? 'IMPROVED' : c.decision === b.decision && added.length === 0 && removed.length === 0 ? 'UNCHANGED' : 'INCONCLUSIVE';
            reason = 'Requires intended replacement and exclusion of every previously selected version; relevance additionally requires direct lexical coverage ≥60%. This tests evidence coverage, not factual truth.';
        }
    }
    else if (b.decision === c.decision) {
        classification = 'UNCHANGED';
        reason = 'Evidence decision unchanged; response correctness is not scored.';
    }
    return { classification, reason, added, removed, overlap, baselineDecision: b.decision, candidateDecision: c.decision, abstainToSupported: b.decision !== 'ANSWER_SUPPORTED' && supported, supportedToAbstain: b.decision === 'ANSWER_SUPPORTED' && !supported };
}
