import { currentKnowledgeScope, visibleKnowledge, type KnowledgeScope } from "./kb.scope.js";
import { prisma } from "../../config/prisma.js";
import type { Candidate } from "./kb.retrieval.js";
// English stemming/stopwords; OR lexemes for recall. Coverage is separate from ts_rank.
// Pure numeric/date literals are retained in the recorded query but do not dilute topical coverage.
// Parameters never become SQL syntax. Expression matches the migration's GIN index.
export async function searchLexical(orgId: string, query: string, limit: number, suppliedScope?: KnowledgeScope): Promise<Candidate[]> {
    const scope=suppliedScope ?? await currentKnowledgeScope(orgId);
    const rows = await prisma.$queryRaw<Array<{
        documentVersionId: string; versionNumber: number; publishedAt: string | null;
        id: string;
        documentId: string;
        chunkIndex: number;
        tokenCount: number;
        content: string;
        originalName: string;
        score: number;
        coverage: number;
    }>> `
    WITH terms AS (SELECT ARRAY(SELECT w FROM unnest(tsvector_to_array(to_tsvector('english', ${query}))) w WHERE w !~ '^[0-9][0-9./-]*$' AND w <> ALL(ARRAY['help','issu','problem','pleas','thank','hello','hi','want','need'])) AS words),
    q AS (SELECT words, to_tsquery('english', array_to_string(ARRAY(SELECT quote_literal(w) FROM unnest(words) w), ' | ')) AS query FROM terms)
    SELECT kc.id, kv.id AS "documentVersionId",kv."versionNumber",kv."publishedAt"::text AS "publishedAt", kc."documentId", kc."chunkIndex", kc."tokenCount", kc.content, kv."originalName",
      ts_rank_cd(to_tsvector('english', kc.content), q.query)::float8 AS score,
      (SELECT count(*)::float8 FROM unnest(q.words) w WHERE w = ANY(tsvector_to_array(to_tsvector('english',kc.content)))) / greatest(cardinality(q.words),1) AS coverage
    FROM "KnowledgeChunk" kc JOIN "KnowledgeDocumentVersion" kv ON kv.id=kc."documentVersionId" JOIN "KnowledgeDocument" kd ON kd.id=kc."documentId" CROSS JOIN q
    WHERE ${visibleKnowledge(orgId,scope)}
      AND to_tsvector('english', kc.content) @@ q.query
    ORDER BY score DESC, kc.id ASC LIMIT ${Math.min(limit, 20)}
  `;
    return rows.map(r => ({ ...r, lexicalCoverage: Number(r.coverage), score: Number(r.score), document: { originalName: r.originalName } }));
}
