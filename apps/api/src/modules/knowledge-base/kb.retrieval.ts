import { createHash } from "node:crypto";
export const CANDIDATE_LIMIT = 20;
export const RRF_K = 60;
export const EVIDENCE_LIMIT = 5;
export type SearchStatus = "OK" | "DISABLED" | "NOT_CONFIGURED" | "EMBEDDING_FAILED" | "VECTOR_FAILED" | "LEXICAL_FAILED" | "INDEX_INCOMPLETE";
export type Candidate = {
    documentVersionId: string; versionNumber: number; publishedAt: string | null;
    id: string;
    documentId: string;
    chunkIndex: number;
    tokenCount: number;
    content: string;
    document: {
        originalName: string;
    };
    score: number;
    distance?: number;
    lexicalCoverage?: number;
};
export type Selected = Candidate & {
    semanticRank: number | null;
    lexicalRank: number | null;
    semanticScore: number | null;
    lexicalScore: number | null;
    semanticDistance: number | null;
    fusedScore: number;
    matchedBy: ("semantic" | "lexical")[];
    contentHash: string;
    rank: number;
    searchType: "hybrid";
};
export function normalizeQuery(value: string) { return value.replace(/\s+/g, " ").trim().slice(0, 700); }
export function buildRetrievalQuery(ticket: {
    title: string;
    description: string;
}, latestCustomer = "") {
    return normalizeQuery([ticket.title.slice(0, 200), latestCustomer.slice(0, 250), ticket.description.slice(0, 250)].filter(Boolean).join(" "));
}
export function fuseCandidates(semantic: Candidate[], lexical: Candidate[], limit = EVIDENCE_LIMIT) {
    const byId = new Map<string, Selected>();
    for (const [mode, list] of [["semantic", semantic], ["lexical", lexical]] as const) {
        const seen = new Set<string>();
        list.slice(0, CANDIDATE_LIMIT).forEach((row, index) => {
            if (seen.has(row.id))
                return;
            seen.add(row.id);
            const candidate = byId.get(row.id) ?? { ...row, semanticRank: null, lexicalRank: null, semanticScore: null,
                lexicalScore: null, semanticDistance: null, fusedScore: 0, matchedBy: [], rank: 0, searchType: "hybrid",
                contentHash: createHash("sha256").update(row.content.trim().toLowerCase().replace(/\s+/g, " ")).digest("hex") };
            candidate.fusedScore += 1 / (RRF_K + index + 1);
            candidate.matchedBy.push(mode);
            if (mode === "semantic") {
                candidate.semanticRank = index + 1;
                candidate.semanticScore = row.score;
                candidate.semanticDistance = row.distance ?? null;
            }
            else {
                candidate.lexicalRank = index + 1;
                candidate.lexicalScore = row.score;
                candidate.lexicalCoverage = row.lexicalCoverage ?? 0;
            }
            byId.set(row.id, candidate);
        });
    }
    const ranked = [...byId.values()].sort((a, b) => b.fusedScore - a.fusedScore || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    ranked.forEach((row, index) => { row.rank = index + 1; row.score = row.fusedScore; });
    const hashes = new Set<string>(), counts = new Map<string, number>();
    const selected: Selected[] = [];
    for (const row of ranked) {
        if (hashes.has(row.contentHash) || (counts.get(row.documentId) ?? 0) >= 2)
            continue;
        hashes.add(row.contentHash);
        counts.set(row.documentId, (counts.get(row.documentId) ?? 0) + 1);
        selected.push({ ...row, score: row.fusedScore, rank: selected.length + 1 });
        if (selected.length >= Math.max(1, Math.min(limit, EVIDENCE_LIMIT)))
            break;
    }
    return { candidates: ranked, selectedEvidence: selected, uniqueDocumentCount: new Set(selected.map(r => r.documentId)).size };
}
