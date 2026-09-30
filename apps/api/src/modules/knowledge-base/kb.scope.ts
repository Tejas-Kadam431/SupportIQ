import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma.js";
// Internal boundary: pin one publication snapshot for BOTH modalities. No client overrides.
export type KnowledgeScope = {
    kind: "current-publication-snapshot" | "evaluation-snapshot";
    versionIds: string[];
};
export async function currentKnowledgeScope(orgId: string): Promise<KnowledgeScope> {
    const docs = await prisma.knowledgeDocument.findMany({ where: { organizationId: orgId, archivedAt: null, currentPublishedVersion: { status: "PUBLISHED" } }, select: { currentPublishedVersionId: true } });
    return { kind: "current-publication-snapshot", versionIds: docs.flatMap(d => d.currentPublishedVersionId ? [d.currentPublishedVersionId] : []) };
}
export function visibleKnowledge(orgId: string, scope: KnowledgeScope) {
    return Prisma.sql `
 kc."organizationId"=${orgId} AND kd."organizationId"=${orgId} AND ${scope.kind === "evaluation-snapshot" ? Prisma.sql`TRUE` : Prisma.sql`kd."archivedAt" IS NULL`}
 AND kv."documentId"=kd.id AND ${scope.kind === "evaluation-snapshot" ? Prisma.sql`kv.status IN ('READY','PUBLISHED','SUPERSEDED')` : Prisma.sql`kv."publishedAt" IS NOT NULL`}
 AND ${scope.versionIds.length ? Prisma.sql `kv.id IN (${Prisma.join(scope.versionIds)})` : Prisma.sql `FALSE`}`;
}
