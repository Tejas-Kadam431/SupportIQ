import { evaluateEvidence, POLICY_LIMITS } from "../modules/ai/evidence-policy.js";
import { buildRetrievalQuery, fuseCandidates } from "../modules/knowledge-base/kb.retrieval.js";
import { evidenceFixtures, row } from "./fixtures/evidence.fixtures.js";
import { classifyKnowledgeFailure } from "../modules/knowledge-issues/issue.classification.js";
jest.mock("../config/prisma.js", () => ({ prisma: {} }));
jest.mock("../modules/organizations/org.service.js", () => ({}));
test.each(evidenceFixtures)("fixture: $name", fixture => {
    const fused = fuseCandidates(fixture.semantic, fixture.lexical);
    const result = evaluateEvidence(fused.selectedEvidence, { semanticStatus: fixture.semanticStatus ?? "OK", lexicalStatus: fixture.lexicalStatus ?? "OK" }, fixture.customer ?? fixture.query);
    expect(result.decision).toBe(fixture.expected);
    expect(result.generationAllowed).toBe(fixture.expected === "ANSWER_SUPPORTED");
});
test("query reserves latest customer context, bounds noisy text and normalizes whitespace", () => {
    const query = buildRetrievalQuery({ title: "t".repeat(1000), description: "d".repeat(5000) }, " latest customer ERR42 ");
    expect(query.length).toBeLessThanOrEqual(700);
    expect(query).toContain("latest customer ERR42");
    expect(buildRetrievalQuery({ title: " ", description: " \n" })).toBe("");
});
test("RRF sums ranks and never compares lexical and semantic scales", () => {
    const fused = fuseCandidates([row("a"), row("b", "b", 0.8)], [row("b", "b", 9999, 1), row("c", "c", 999, 1)]);
    expect(fused.selectedEvidence.map(r => r.id)).toEqual(["b", "a", "c"]);
    expect(fused.candidates.map(row => row.rank)).toEqual([1, 2, 3]);
    expect(fused.selectedEvidence[0].fusedScore).toBeCloseTo(1 / 62 + 1 / 61);
    expect(fused.selectedEvidence[0].matchedBy).toEqual(["semantic", "lexical"]);
});
test("identity/content deduplication, deterministic ties and document cap", () => {
    const result = fuseCandidates([row("b", "one"), row("b", "one"), row("c", " ONE "), row("d", "two", 0.9, 0, "b"), row("e", "three", 0.9, 0, "b")], [row("a", "different", 1, 1)]);
    expect(result.selectedEvidence.map(r => r.id)).toEqual(["a", "b", "d"]);
    expect(result.uniqueDocumentCount).toBe(2);
    expect(fuseCandidates([row("one")], []).selectedEvidence).toHaveLength(1);
});
test("initial fixture sweep rejects lower unsupported semantic cutoff", () => {
    const weak = evidenceFixtures.filter(f => f.expected === "INSUFFICIENT_KNOWLEDGE").flatMap(f => f.semantic);
    expect(weak.filter(r => r.score >= 0.6).length).toBeGreaterThan(0);
    expect(weak.filter(r => r.score >= POLICY_LIMITS.semanticStrong)).toHaveLength(0);
});
test("only explicit knowledge abstention is a knowledge signal, including legacy handling", () => {
 const make=(decision:string,version:string|null="evidence-v2")=>({topic:decision,abstained:true,sources:[],evaluation:null,evidencePolicyVersion:version,outputSnapshot:{evidenceDecision:decision}});
 expect([make("RETRIEVAL_DEGRADED"),make("NEEDS_CUSTOMER_INFO"),make("INSUFFICIENT_KNOWLEDGE"),make("old",null)].map(classifyKnowledgeFailure)).toEqual([null,null,"INSUFFICIENT_KNOWLEDGE",null]);
});
