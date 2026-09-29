import { currentKnowledgeScope, type KnowledgeScope } from "./kb.scope.js";
import { searchLexical } from "./kb.lexical.js";
import { searchKnowledgeChunksByVector } from "./kb.vector.js";
import { CANDIDATE_LIMIT, fuseCandidates, normalizeQuery, type SearchStatus } from "./kb.retrieval.js";
export async function retrieveHybrid(orgId: string, input: string, limit = 5) {
 return retrieveScoped(orgId, input, limit);
}
// Internal only: production callers never receive a scope from HTTP input.
export async function retrieveScoped(orgId: string, input: string, limit = 5, suppliedScope?: KnowledgeScope, semanticEnabled = true) {
    const query = normalizeQuery(input), start = Date.now();
    let scope;
    try {scope=suppliedScope ?? await currentKnowledgeScope(orgId);} catch {return {query,mode:"hybrid" as const,results:[],total:0,...fuseCandidates([],[]),diagnostics:{status:"DEGRADED",semanticStatus:"VECTOR_FAILED" as const,lexicalStatus:"LEXICAL_FAILED" as const,latencyMs:Date.now()-start,semanticLatencyMs:0,lexicalLatencyMs:0,semanticCandidates:0,lexicalCandidates:0,fusedCandidates:0,missingEmbeddings:null,uniqueDocumentCount:0,selectedChunkCount:0}};}
    const semanticTask = async () => {
        const at = Date.now();
        try {
            return { ...await searchKnowledgeChunksByVector(orgId, query, CANDIDATE_LIMIT, scope), latencyMs: Date.now() - at };
        }
        catch {
            return { status: "VECTOR_FAILED" as SearchStatus, results: [], missingEmbeddings: null, latencyMs: Date.now() - at };
        }
    };
    const lexicalTask = async () => {
        const at = Date.now();
        try {
            return { status: "OK" as SearchStatus, results: query ? await searchLexical(orgId, query, CANDIDATE_LIMIT, scope) : [], latencyMs: Date.now() - at };
        }
        catch {
            console.warn({ event: "retrieval.lexical_failed" });
            return { status: "LEXICAL_FAILED" as SearchStatus, results: [], latencyMs: Date.now() - at };
        }
    };
    const [semantic, lexical] = await Promise.all([query && semanticEnabled ? semanticTask() : Promise.resolve({ status: (semanticEnabled ? "OK" : "DISABLED") as SearchStatus, results: [], missingEmbeddings: 0, latencyMs: 0 }), lexicalTask()]);
    const fusion = fuseCandidates(semantic.results, lexical.results, limit);
    return { query, mode: semanticEnabled ? "hybrid" as const : "keyword" as const, results: fusion.selectedEvidence, total: fusion.selectedEvidence.length, ...fusion,
        diagnostics: { status: (semantic.status === "OK" || semantic.status === "DISABLED") && lexical.status === "OK" ? "OK" : "DEGRADED", semanticStatus: semantic.status, lexicalStatus: lexical.status,
            latencyMs: Date.now() - start, semanticLatencyMs: semantic.latencyMs, lexicalLatencyMs: lexical.latencyMs,
            semanticCandidates: semantic.results.length, lexicalCandidates: lexical.results.length, fusedCandidates: fusion.candidates.length,
            missingEmbeddings: semantic.missingEmbeddings, uniqueDocumentCount: fusion.uniqueDocumentCount, selectedChunkCount: fusion.selectedEvidence.length } };
}
export type HybridResult = Awaited<ReturnType<typeof retrieveHybrid>>;
