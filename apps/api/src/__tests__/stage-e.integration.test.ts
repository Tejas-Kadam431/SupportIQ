import { contentHash } from "../common/utils/contentHash.js";
import { prisma } from "../config/prisma.js";
import { env } from "../config/env.js";
import { searchLexical as rawLexical } from "../modules/knowledge-base/kb.lexical.js";
import { retrieveHybrid as rawHybrid } from "../modules/knowledge-base/kb.hybrid.js";
import { queryVectorCandidates as rawVector } from "../modules/knowledge-base/kb.vector.js";
import { generateAiDraftReply } from "../modules/ai/ai.service.js";
import { generateWithProviders } from "../modules/ai/ai.provider.js";
import { getOrganizationDashboard } from "../modules/dashboard/dashboard.service.js";
const mockEmbed = jest.fn();
jest.mock("openai", () => ({ __esModule: true, default: jest.fn().mockImplementation(() => ({ embeddings: { create: (...args: unknown[]) => mockEmbed(...args) } })) }));
jest.mock("../modules/ai/ai.provider.js", () => ({ generateWithProviders: jest.fn() }));
const prefix = "stage-e-" + Date.now();
let userId: string, orgId: string, otherId: string, customerId: string, docId: string, ticketId: string;
let seq = 0;
const vectorTest = process.env.SUPPORTIQ_TEST_PGVECTOR === "1" ? test : test.skip;
const vector = (a: number, b = 0) => [a, b, ...Array(1534).fill(0)];
beforeAll(async () => {
    const u = await prisma.user.create({ data: { email: prefix + "@test.invalid", name: "Agent", passwordHash: "fixture" } });
    userId = u.id;
    const c = await prisma.user.create({ data: { email: prefix + "-customer@test.invalid", name: "Customer", passwordHash: "fixture" } });
    customerId = c.id;
    for (const other of [false, true]) {
        const o = await prisma.organization.create({ data: { name: prefix, slug: prefix + other, ownerId: userId } });
        if (other)
            otherId = o.id;
        else
            orgId = o.id;
    }
    await prisma.organizationMember.createMany({ data: [{ organizationId: orgId, userId, role: "OWNER" }, { organizationId: orgId, userId: customerId, role: "CUSTOMER" }] });
});
beforeEach(async () => {
    env.OPENAI_API_KEY = "";
    mockEmbed.mockReset();
    (generateWithProviders as jest.Mock).mockReset();
    (generateWithProviders as jest.Mock).mockResolvedValue({ draft: "Use the documented procedure.", rawDraft: "Use the documented procedure.", provider: "gemini", model: "fixture", requests: [{ provider: "gemini" }], attempts: [], fallbackReason: null });
    await prisma.knowledgeDocument.updateMany({ where: { organizationId: { in: [orgId, otherId] } }, data:{archivedAt:new Date()} });
    const d = await document("READY");
    docId = d.id;
    const t = await prisma.ticket.create({ data: { organizationId: orgId, customerId, title: "Password reset", description: "Password reset account" } });
    ticketId = t.id;
});
afterAll(async () => { await prisma.organization.deleteMany({ where: { id: { in: [orgId, otherId] } } }); await prisma.user.deleteMany({ where: { id: { in: [userId, customerId] } } }); await prisma.$disconnect(); });
async function document(status: "READY" | "FAILED" = "READY", organizationId = orgId) { return prisma.knowledgeDocument.create({ data: { organizationId, uploadedById: userId, fileName: "fixture", originalName: "Fixture", mimeType: "text/plain", sizeBytes: 10, storagePath: "fixture", status } }); }
async function chunk(content:string,documentId=docId,organizationId=orgId){
 let v=await prisma.knowledgeDocumentVersion.findFirst({where:{documentId}});
 if(!v){const d=await prisma.knowledgeDocument.findUniqueOrThrow({where:{id:documentId}});v=await prisma.knowledgeDocumentVersion.create({data:{documentId,versionNumber:1,status:d.status==="FAILED"?"FAILED":"READY",originalName:d.originalName,mimeType:d.mimeType,sizeBytes:10,storageRef:d.storagePath,createdByIdentity:userId,contentHash:contentHash(content),semanticIndexedChunks:0}});}
 return prisma.knowledgeChunk.create({data:{documentId,documentVersionId:v.id,organizationId,chunkIndex:seq++,content,contentHash:contentHash(content),tokenCount:10}});
}
async function publishFixtures(){await prisma.$transaction(async tx=>{
 const docs=await tx.knowledgeDocument.findMany({where:{organizationId:{in:[orgId,otherId]},archivedAt:null,currentPublishedVersionId:null},include:{versions:true}});
 for(const d of docs){const v=d.versions.find(v=>v.status==="READY");if(!v)continue;
 await tx.knowledgeDocumentVersion.update({where:{id:v.id},data:{status:"PUBLISHED",publishedAt:new Date()}});
 await tx.knowledgeDocument.update({where:{id:d.id},data:{currentPublishedVersionId:v.id,nextVersionNumber:2}});}
});}
async function searchLexical(...args:Parameters<typeof rawLexical>){await publishFixtures();return rawLexical(...args);}
async function retrieveHybrid(...args:Parameters<typeof rawHybrid>){await publishFixtures();return rawHybrid(...args);}
async function queryVectorCandidates(...args:Parameters<typeof rawVector>){await publishFixtures();return rawVector(...args);}
async function generate(){await publishFixtures();return generateAiDraftReply(userId,ticketId,{tone:"PROFESSIONAL"});}

test("FTS tokenization, ranked exact terms, stopwords and parameter safety", async () => {
    const exact = await chunk("Passwords resetting account password reset");
    await chunk("Account billing");
    const rows = await searchLexical(orgId, "password resets", 20);
    expect(rows[0].id).toBe(exact.id);
    expect(rows[0].lexicalCoverage).toBe(1);
    expect(await searchLexical(orgId, "the and a", 20)).toEqual([]);
    expect(await searchLexical(orgId, "", 20)).toEqual([]);
    await expect(searchLexical(orgId, "' ; DROP TABLE x; --", 20)).resolves.toBeDefined();
});
test("FTS tenant/status filters and identifier search", async () => {
    const own = await chunk("ERR42 SSO connection procedure");
    const foreign = await document("READY", otherId);
    await chunk("ERR42 SSO", foreign.id, otherId);
    const failed = await document("FAILED");
    await chunk("ERR42 SSO", failed.id);
    expect((await searchLexical(orgId, "ERR42", 20)).map(r => r.id)).toEqual([own.id]);
});
test("hybrid retains lexical when embedding provider fails, records degradation", async () => {
    await chunk("Password reset account");
    env.OPENAI_API_KEY = "fixture";
    mockEmbed.mockRejectedValue(new Error("secret provider body"));
    const result = await retrieveHybrid(orgId, "Password reset account");
    expect(result.results).toHaveLength(1);
    expect(result.diagnostics).toMatchObject({ semanticStatus: "EMBEDDING_FAILED", lexicalStatus: "OK", selectedChunkCount: 1, uniqueDocumentCount: 1 });
});
test("no query is empty and no embedding call is made", async () => { env.OPENAI_API_KEY = "fixture"; expect((await retrieveHybrid(orgId, " ")).results).toEqual([]); expect(mockEmbed).not.toHaveBeenCalled(); });
test("supported evidence invokes generation and persists ranks, hashes, versions and health", async () => {
    await chunk("Password reset account. Use settings.");
    const generated = await generate();
    expect(generateWithProviders).toHaveBeenCalledTimes(1);
    const run = await prisma.copilotRun.findUniqueOrThrow({ where: { id: generated.runId! } });
    expect(run).toMatchObject({ retrievalVersion: "hybrid-rrf-published-v2", evidencePolicyVersion: "evidence-v2", generationPath: "MODEL" });
    expect(run.providerMetadata).toMatchObject({ providerCallAttempted: true, retrieval: { semanticStatus: "NOT_CONFIGURED", lexicalStatus: "OK" } });
    expect(run.sources).toEqual([expect.objectContaining({ lexicalRank: 1, semanticRank: null, matchedBy: ["lexical"], evidenceEligible: true, contentHash: expect.any(String) })]);
});
test("no evidence with unavailable semantic path gates generation and is not a KB gap", async () => {
    const generated = await generate();
    expect(generateWithProviders).not.toHaveBeenCalled();
    expect(generated.suggestedReply).toBeNull();
    expect(generated.evidenceDecision).toBe("RETRIEVAL_DEGRADED");
    const run = await prisma.copilotRun.findUniqueOrThrow({ where: { id: generated.runId! } });
    expect(run.providerMetadata).toMatchObject({ providerCallAttempted: false });
    expect(run.generationPath).toBe("SKIPPED_EVIDENCE");
    const dashboard = await getOrganizationDashboard(userId, orgId);
    expect(dashboard.aiQuality.knowledgeGaps.some(g => g.topic === generated.topic)).toBe(false);
});
test("required customer facts gate provider; supplied facts allow it", async () => {
    await prisma.ticket.update({ where: { id: ticketId }, data: { title: "Refund", description: "Refund order purchase" } });
    await chunk("Refunds require order number and purchase date.");
    const first = await generate();
    expect(first.evidenceDecision).toBe("NEEDS_CUSTOMER_INFO");
    expect(generateWithProviders).not.toHaveBeenCalled();
    await prisma.ticketMessage.create({ data: { ticketId, senderId: customerId, body: "Order number 1234, purchased on 2026-01-01" } });
    const next = await generate();
    expect(next.evidenceDecision).toBe("ANSWER_SUPPORTED");
    expect(generateWithProviders).toHaveBeenCalledTimes(1);
});
test("explicit contradictory windows gate provider", async () => {
    await prisma.ticket.update({ where: { id: ticketId }, data: { title: "Refund window", description: "Refund window days" } });
    await chunk("Refund window is 30 days.");
    const second = await document();
    await chunk("Refund window is 60 days.", second.id);
    expect((await generate()).evidenceDecision).toBe("CONFLICTING_KNOWLEDGE");
    expect(generateWithProviders).not.toHaveBeenCalled();
});
test("latest customer query changes while agent message is not used as customer fact", async () => {
    await prisma.ticketMessage.create({ data: { ticketId, senderId: customerId, body: "ERR42" } });
    await prisma.ticketMessage.create({ data: { ticketId, senderId: userId, body: "internal public agent response" } });
    await chunk("Password reset account ERR42 procedure");
    const result = await generate();
    expect(result.grounding.searchQuery).toContain("ERR42");
    expect(result.grounding.searchQuery).not.toContain("internal public");
});
test("FTS GIN expression exists and planner can use it", async () => {
    const indexes = await prisma.$queryRaw<Array<{
        indexdef: string;
    }>> `SELECT indexdef FROM pg_indexes WHERE indexname='KnowledgeChunk_content_fts_idx'`;
    expect(indexes[0].indexdef).toContain("USING gin");
    const plan = await prisma.$transaction(async (tx) => { await tx.$executeRawUnsafe("SET LOCAL enable_seqscan=off"); return tx.$queryRawUnsafe<Array<{
        "QUERY PLAN": string;
    }>>("EXPLAIN SELECT id FROM \"KnowledgeChunk\" WHERE to_tsvector('english',content) @@ plainto_tsquery('english','password')"); });
    expect(JSON.stringify(plan)).toContain("KnowledgeChunk_content_fts_idx");
});
vectorTest("real pgvector ranking and tenant/status filtering", async () => {
    const a = await chunk("Password reset"), b = await chunk("Other account topic");
    const foreign = await document("READY", otherId);
    const c = await chunk("Foreign", foreign.id, otherId);
    for (const [id, v] of [[a.id, vector(1)], [b.id, vector(0, 1)], [c.id, vector(1)]] as const)
        await prisma.$executeRaw `UPDATE "KnowledgeChunk" SET embedding=${JSON.stringify(v)}::vector WHERE id=${id}`;
    const rows = await queryVectorCandidates(orgId, vector(1), 20);
    expect(rows.map(r => r.id)).toEqual([a.id, b.id]);
    expect(rows[0].score).toBeCloseTo(1);
    expect(rows[1].score).toBeCloseTo(0);
    env.OPENAI_API_KEY = "fixture";
    mockEmbed.mockResolvedValue({ data: [{ embedding: vector(1) }] });
    const result = await retrieveHybrid(orgId, "Password reset");
    expect(result.results[0].matchedBy).toEqual(["semantic", "lexical"]);
    await chunk("Unembedded",(await document()).id);
    expect((await retrieveHybrid(orgId, "Password reset")).diagnostics.semanticStatus).toBe("INDEX_INCOMPLETE");
});
