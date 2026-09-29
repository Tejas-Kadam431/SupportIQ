import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { prisma } from "../config/prisma.js";
import { createVersionRecord, publishKnowledgeVersion, archiveKnowledgeDocument, getVersionHistory } from "../modules/knowledge-base/kb.version.service.js";
import { processKnowledgeDocument } from "../modules/knowledge-base/kb.processing.js";
import { searchLexical } from "../modules/knowledge-base/kb.lexical.js";
import { retrieveHybrid } from "../modules/knowledge-base/kb.hybrid.js";
import { currentKnowledgeScope } from "../modules/knowledge-base/kb.scope.js";
import { saveKnowledgeChunkEmbedding, queryVectorCandidates } from "../modules/knowledge-base/kb.vector.js";
import { generateAiDraftReply } from "../modules/ai/ai.service.js";
import { resolveCopilotKnowledge } from "../modules/knowledge-base/kb.provenance.js";
import { contentHash } from "../common/utils/contentHash.js";
import express from "express";
import request from "supertest";
import { enqueueKnowledgeDocumentProcessing } from "../modules/knowledge-base/kb.queue.js";
import { createKnowledgeDocument } from "../modules/knowledge-base/kb.service.js";
import { kbRoutes } from "../modules/knowledge-base/kb.routes.js";
import { signAccessToken } from "../common/utils/jwt.js";
import { errorHandler } from "../common/errors/errorHandler.js";
jest.mock("../modules/knowledge-base/kb.vector.js", () => ({ ...jest.requireActual("../modules/knowledge-base/kb.vector.js"), saveKnowledgeChunkEmbedding: jest.fn(async () => false) }));
jest.mock("../modules/knowledge-base/kb.queue.js", () => ({ enqueueKnowledgeDocumentProcessing: jest.fn(async () => ({})), closeKnowledgeProcessingResources: async () => {} }));
const app = express();
app.use(express.json());
app.use("/organizations/:orgId/kb", kbRoutes);
app.use(errorHandler);
const prefix = "stage-f-" + Date.now();
let seq = 0;
const orgs: string[] = [], users: string[] = [];
const vectorTest = process.env.SUPPORTIQ_TEST_PGVECTOR === "1" ? test : test.skip;
afterAll(async () => { await prisma.organization.deleteMany({ where: { id: { in: orgs } } }); await prisma.user.deleteMany({ where: { id: { in: users } } }); await prisma.$disconnect(); });
async function fixture() {
    const key = seq++;
    const people = await Promise.all(["OWNER", "ADMIN", "CUSTOMER"].map(async (role) => { const u = await prisma.user.create({ data: { email: prefix + key + role + "@test.invalid", name: role, passwordHash: "fixture" } }); users.push(u.id); return u; }));
    const [owner, admin, customer] = people;
    const org = await prisma.organization.create({ data: { name: prefix, slug: prefix + key, ownerId: owner.id } });
    orgs.push(org.id);
    await prisma.organizationMember.createMany({ data: people.map((u, i) => ({ organizationId: org.id, userId: u.id, role: (["OWNER", "ADMIN", "CUSTOMER"] as const)[i] })) });
    return { owner, admin, customer, org };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
async function source(text: string) { const storagePath = path.join(os.tmpdir(), prefix + "-" + (seq++) + ".txt"); await fs.writeFile(storagePath, text); return { storagePath, fileName: path.basename(storagePath), originalName: "Password Policy.txt", mimeType: "text/plain", sizeBytes: Buffer.byteLength(text) }; }
async function version(f: Fixture, text = "Password reset account settings procedure.", documentId?: string) { return createVersionRecord(f.owner.id, f.org.id, await source(text), documentId); }
async function prepared(f: Fixture, text?: string, documentId?: string) { const result = await version(f, text, documentId); await processKnowledgeDocument(f.org.id, result.document.id, result.version.id); return result; }
async function published(f: Fixture) { const result = await prepared(f); await publishKnowledgeVersion(f.owner.id, f.org.id, result.document.id, result.version.id, null); return result; }
test("v1 then concurrent distinct updates allocate monotonic unique versions; duplicate bytes reuse version", async () => {
    const f = await fixture(), first = await version(f);
    expect(first.version.versionNumber).toBe(1);
    const results = await Promise.all([version(f, "Second content", first.document.id), version(f, "Third content", first.document.id)]);
    expect(results.map(r => r.version.versionNumber).sort()).toEqual([2, 3]);
    const duplicate = await version(f, "Second content", first.document.id);
    expect(duplicate.duplicate).toBe(true);
    expect(duplicate.version.id).toBe(results[0].version.id);
    expect(await prisma.knowledgeDocumentVersion.count({ where: { documentId: first.document.id } })).toBe(3);
});
test("customer/cross-tenant/demo version mutation denied at service and HTTP boundaries", async () => {
    const f = await fixture(), other = await fixture(), input = await source("Content");
    const first = await version(f);
    await expect(createVersionRecord(f.customer.id, f.org.id, input)).rejects.toMatchObject({ statusCode: 403 });
    await expect(createVersionRecord(other.owner.id, other.org.id, input, first.document.id)).rejects.toMatchObject({ statusCode: 404 });
    const previous = process.env.DEMO_READONLY_EMAILS;
    process.env.DEMO_READONLY_EMAILS = f.owner.email;
    try {
        await expect(createVersionRecord(f.owner.id, f.org.id, input)).rejects.toMatchObject({ statusCode: 403 });
        await request(app).post('/organizations/' + f.org.id + '/kb/documents/' + first.document.id + '/versions/' + first.version.id + '/publish').set('Authorization', 'Bearer ' + signAccessToken(f.owner.id)).send({ expectedCurrentVersionId: null }).expect(403);
    }
    finally {
        if (previous === undefined)
            delete process.env.DEMO_READONLY_EMAILS;
        else
            process.env.DEMO_READONLY_EMAILS = previous;
    }
    await request(app).get('/organizations/' + f.org.id + '/kb/documents/' + first.document.id + '/versions').set('Authorization', 'Bearer ' + signAccessToken(f.customer.id)).expect(403);
});
test("processing stages immutable source hashes and incomplete embedding metadata before explicit publication", async () => {
    const f = await fixture(), result = await prepared(f);
    const v = await prisma.knowledgeDocumentVersion.findUniqueOrThrow({ where: { id: result.version.id }, include: { chunks: true } });
    expect(v.status).toBe("READY");
    expect(v.semanticIndexedChunks).toBe(0);
    expect(v.sourceHash).toBe(contentHash("Password reset account settings procedure."));
    expect(v.chunks.every(c => c.documentVersionId === v.id && c.contentHash === contentHash(c.content))).toBe(true);
    expect(await searchLexical(f.org.id, "password reset", 20)).toEqual([]);
    await publishKnowledgeVersion(f.owner.id, f.org.id, result.document.id, v.id, null);
    expect((await retrieveHybrid(f.org.id, "password reset")).results[0].documentVersionId).toBe(v.id);
});
test("failed replacement leaves previous publication and chunks intact", async () => {
    const f = await fixture(), first = await published(f), second = await version(f, "", first.document.id);
    await expect(processKnowledgeDocument(f.org.id, first.document.id, second.version.id)).rejects.toMatchObject({ statusCode: 503 });
    expect((await prisma.knowledgeDocumentVersion.findUniqueOrThrow({ where: { id: second.version.id } })).status).toBe("FAILED");
    expect((await searchLexical(f.org.id, "password reset", 20))[0].documentVersionId).toBe(first.version.id);
});
test("tampered uploaded file fails verification; completed publication reprocessing is a no-op", async () => {
    const f = await fixture(), first = await published(f);
    const before = await prisma.knowledgeChunk.findMany({ where: { documentVersionId: first.version.id } });
    expect((await processKnowledgeDocument(f.org.id, first.document.id, first.version.id)).status).toBe("UNCHANGED");
    expect(await prisma.knowledgeChunk.findMany({ where: { documentVersionId: first.version.id } })).toEqual(before);
    const second = await version(f, "New source", first.document.id);
    await fs.writeFile(second.version.storageRef, "Changed outside upload");
    await expect(processKnowledgeDocument(f.org.id, first.document.id, second.version.id)).rejects.toMatchObject({ statusCode: 503 });
});
test.each(["UPLOADED", "PROCESSING", "FAILED"] as const)("%s cannot publish", async (status) => {
    const f = await fixture(), v = await version(f);
    await prisma.knowledgeDocumentVersion.update({ where: { id: v.version.id }, data: { status } });
    await expect(publishKnowledgeVersion(f.owner.id, f.org.id, v.document.id, v.version.id, null)).rejects.toMatchObject({ statusCode: 409 });
});
test("concurrent publications require the same expected current pointer and exactly one wins", async () => {
    const f = await fixture(), first = await published(f);
    const [a, b] = await Promise.all([prepared(f, "Password reset revised A", first.document.id), prepared(f, "Password reset revised B", first.document.id)]);
    const results = await Promise.allSettled([publishKnowledgeVersion(f.owner.id, f.org.id, first.document.id, a.version.id, first.version.id), publishKnowledgeVersion(f.admin.id, f.org.id, first.document.id, b.version.id, first.version.id)]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect((results.find(r => r.status === "rejected") as PromiseRejectedResult).reason.statusCode).toBe(409);
    expect(await prisma.knowledgeDocumentVersion.count({ where: { documentId: first.document.id, status: "PUBLISHED" } })).toBe(1);
    const doc = await prisma.knowledgeDocument.findUniqueOrThrow({ where: { id: first.document.id } });
    expect([a.version.id, b.version.id]).toContain(doc.currentPublishedVersionId);
    expect((await prisma.knowledgeDocumentVersion.findUniqueOrThrow({ where: { id: first.version.id } })).status).toBe("SUPERSEDED");
    expect(await prisma.activityLog.count({ where: { organizationId: f.org.id, message: "VERSION_SUPERSEDED" } })).toBe(1);
});
test("publication rollback includes current pointer, old state and required activity", async () => {
    const f = await fixture(), first = await published(f), second = await prepared(f, "Password reset revised", first.document.id);
    await prisma.$executeRawUnsafe("CREATE FUNCTION stage_f_fail_activity() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.message='VERSION_PUBLISHED' THEN RAISE EXCEPTION 'injected'; END IF; RETURN NEW; END $$");
    await prisma.$executeRawUnsafe('CREATE TRIGGER stage_f_fail_activity BEFORE INSERT ON "ActivityLog" FOR EACH ROW EXECUTE FUNCTION stage_f_fail_activity()');
    try {
        await expect(publishKnowledgeVersion(f.owner.id, f.org.id, first.document.id, second.version.id, first.version.id)).rejects.toThrow();
    }
    finally {
        await prisma.$executeRawUnsafe('DROP TRIGGER stage_f_fail_activity ON "ActivityLog"');
        await prisma.$executeRawUnsafe('DROP FUNCTION stage_f_fail_activity()');
    }
    expect((await prisma.knowledgeDocument.findUniqueOrThrow({ where: { id: first.document.id } })).currentPublishedVersionId).toBe(first.version.id);
    expect((await prisma.knowledgeDocumentVersion.findUniqueOrThrow({ where: { id: second.version.id } })).status).toBe("READY");
});
test("new retrieval uses v2 only; captured internal scope stays coherent across publication", async () => {
    const f = await fixture(), first = await published(f), scope = await currentKnowledgeScope(f.org.id), second = await prepared(f, "Password reset new instructions", first.document.id);
    await publishKnowledgeVersion(f.owner.id, f.org.id, first.document.id, second.version.id, first.version.id);
    expect((await searchLexical(f.org.id, "password reset", 20)).every(c => c.documentVersionId === second.version.id)).toBe(true);
    expect((await searchLexical(f.org.id, "password reset", 20, scope)).every(c => c.documentVersionId === first.version.id)).toBe(true);
});
test("historical Copilot links and snapshots survive replacement and archive with current-version comparison", async () => {
    const f = await fixture(), first = await published(f);
    const t = await prisma.ticket.create({ data: { organizationId: f.org.id, customerId: f.customer.id, title: "Password reset", description: "Password account settings" } });
    const run = await generateAiDraftReply(f.owner.id, t.id, { tone: "PROFESSIONAL" });
    const snapshot = (await prisma.copilotRun.findUniqueOrThrow({ where: { id: run.runId! } })).sources;
    const second = await prepared(f, "Password reset account revised instructions.", first.document.id);
    await publishKnowledgeVersion(f.owner.id, f.org.id, first.document.id, second.version.id, first.version.id);
    const resolved = await resolveCopilotKnowledge(f.owner.id, f.org.id, run.runId!);
    expect(resolved.sources[0]).toMatchObject({ versionNumber: 1, currentVersionNumber: 2, isCurrent: false, contentChanged: true });
    expect(resolved.snapshots).toEqual(snapshot);
    await archiveKnowledgeDocument(f.owner.id, f.org.id, first.document.id);
    expect((await retrieveHybrid(f.org.id, "password reset")).results).toEqual([]);
    expect((await resolveCopilotKnowledge(f.owner.id, f.org.id, run.runId!)).sources[0].archived).toBe(true);
    const other = await fixture();
    await expect(resolveCopilotKnowledge(other.owner.id, other.org.id, run.runId!)).rejects.toMatchObject({ statusCode: 404 });
});
test("database forbids published content, source, version and chunk deletion/modification", async () => {
    const f = await fixture(), first = await published(f);
    const chunk = await prisma.knowledgeChunk.findFirstOrThrow({ where: { documentVersionId: first.version.id } });
    await expect(prisma.knowledgeDocumentVersion.update({ where: { id: first.version.id }, data: { extractedText: "Changed" } })).rejects.toThrow();
    await expect(prisma.knowledgeDocumentVersion.update({ where: { id: first.version.id }, data: { versionNumber: 99 } })).rejects.toThrow();
    await expect(prisma.knowledgeChunk.update({ where: { id: chunk.id }, data: { content: "Changed", contentHash: contentHash("Changed") } })).rejects.toThrow();
    await expect(prisma.knowledgeChunk.delete({ where: { id: chunk.id } })).rejects.toThrow();
    await expect(prisma.knowledgeDocumentVersion.delete({ where: { id: first.version.id } })).rejects.toThrow();
    await expect(prisma.knowledgeDocument.delete({ where: { id: first.document.id } })).rejects.toThrow();
    expect((await getVersionHistory(f.owner.id, f.org.id, first.document.id)).versions).toHaveLength(1);
});
test("unpublished failed version may be deleted by maintenance without affecting current", async () => {
    const f = await fixture(), first = await published(f), second = await version(f, "Failed update", first.document.id);
    await prisma.knowledgeDocumentVersion.update({ where: { id: second.version.id }, data: { status: "FAILED" } });
    await prisma.knowledgeDocumentVersion.delete({ where: { id: second.version.id } });
    expect((await searchLexical(f.org.id, "password reset", 20))[0].documentVersionId).toBe(first.version.id);
});
vectorTest("real vector SQL excludes superseded/unpublished/archived versions and preserves old embeddings", async () => {
    const f = await fixture(), first = await prepared(f), second = await prepared(f, "Password reset revised", first.document.id);
    const vector = JSON.stringify([1, ...Array(1535).fill(0)]);
    for (const v of [first, second])
        await prisma.$executeRaw `UPDATE "KnowledgeChunk" SET embedding=${vector}::vector WHERE "documentVersionId"=${v.version.id}`;
    await publishKnowledgeVersion(f.owner.id, f.org.id, first.document.id, first.version.id, null);
    expect((await queryVectorCandidates(f.org.id, JSON.parse(vector), 20)).map(c => c.documentVersionId)).toEqual([first.version.id]);
    await publishKnowledgeVersion(f.owner.id, f.org.id, first.document.id, second.version.id, first.version.id);
    expect((await queryVectorCandidates(f.org.id, JSON.parse(vector), 20)).map(c => c.documentVersionId)).toEqual([second.version.id]);
    const old = await prisma.$queryRaw<Array<{
        value: string;
    }>> `SELECT embedding::text AS value FROM "KnowledgeChunk" WHERE "documentVersionId"=${first.version.id}`;
    expect(old[0].value).toBe(vector);
    await archiveKnowledgeDocument(f.owner.id, f.org.id, first.document.id);
    expect(await queryVectorCandidates(f.org.id, JSON.parse(vector), 20)).toEqual([]);
});
test("HTTP replacement upload stays under the same logical document and publication checks expected pointer", async () => {
    const f = await fixture(), first = await published(f), upload = await source("Password reset replacement from HTTP");
    const base = '/organizations/' + f.org.id + '/kb/documents/' + first.document.id;
    const auth = { Authorization: 'Bearer ' + signAccessToken(f.owner.id) };
    const response = await request(app).post(base + '/versions').set(auth).attach('file', upload.storagePath).expect(201);
    expect(response.body.data.document.id).toBe(first.document.id);
    expect(response.body.data.document.versions[0].versionNumber).toBe(2);
    const versionId = response.body.data.document.versions[0].id;
    await processKnowledgeDocument(f.org.id, first.document.id, versionId);
    await request(app).post(base + '/versions/' + versionId + '/publish').set(auth).send({ expectedCurrentVersionId: null }).expect(409);
    await request(app).post(base + '/versions/' + versionId + '/publish').set(auth).send({ expectedCurrentVersionId: first.version.id }).expect(200);
    await request(app).delete(base).set(auth).expect(200);
    expect((await getVersionHistory(f.owner.id, f.org.id, first.document.id)).archivedAt).not.toBeNull();
});
test("processing lease excludes duplicate workers and fences a stale completion after takeover", async () => {
    const f = await fixture(), target = await version(f);
    let release!: () => void;
    let entered!: () => void;
    const waiting = new Promise<void>(resolve => { entered = resolve; });
    const hold = new Promise<void>(resolve => { release = resolve; });
    jest.mocked(saveKnowledgeChunkEmbedding).mockImplementationOnce(async () => { entered(); await hold; return false; });
    const stale = processKnowledgeDocument(f.org.id, target.document.id, target.version.id);
    // Attach the rejection handler before releasing the intentionally stale worker.
    const staleResult = stale.then(value => ({ value, error: null }), error => ({ value: null, error }));
    try {
        await waiting;
        await expect(processKnowledgeDocument(f.org.id, target.document.id, target.version.id)).rejects.toMatchObject({ statusCode: 409 });
        await prisma.knowledgeDocumentVersion.update({ where: { id: target.version.id }, data: { leaseUntil: new Date(0) } });
        expect((await processKnowledgeDocument(f.org.id, target.document.id, target.version.id)).status).toBe("READY");
        const chunks = await prisma.knowledgeChunk.findMany({ where: { documentVersionId: target.version.id } });
        release();
        expect((await staleResult).error).toMatchObject({ statusCode: 503 });
        expect(await prisma.knowledgeChunk.findMany({ where: { documentVersionId: target.version.id } })).toEqual(chunks);
        expect((await prisma.knowledgeDocumentVersion.findUniqueOrThrow({ where: { id: target.version.id } })).status).toBe("READY");
        expect(await prisma.activityLog.count({ where: { organizationId: f.org.id, message: "VERSION_PROCESSING_FAILED" } })).toBe(0);
    }
    finally {
        release();
        await staleResult;
    }
});


test("queue failure retains the uploaded version for explicit retry", async () => {
 const f=await fixture(), first=await published(f);
 jest.mocked(enqueueKnowledgeDocumentProcessing).mockRejectedValueOnce(new Error("Queue unavailable"));
 await expect(createKnowledgeDocument(f.owner.id,f.org.id,await source("Replacement retained after queue failure"),first.document.id)).rejects.toMatchObject({statusCode:503});
 const history=await getVersionHistory(f.owner.id,f.org.id,first.document.id);
 expect(history.currentPublishedVersionId).toBe(first.version.id);
 expect(history.versions[0]).toMatchObject({versionNumber:2,status:"UPLOADED"});
});
