import { prisma } from "../config/prisma.js";
import { createVersionRecord, publishKnowledgeVersion } from "../modules/knowledge-base/kb.version.service.js";
import { processKnowledgeDocument } from "../modules/knowledge-base/kb.processing.js";
import { dispatchKnowledgeOutbox, knowledgeJobId } from "../modules/knowledge-base/kb.outbox.js";
import { reconcileKnowledge } from "../modules/knowledge-base/kb.reconcile.js";
import { reprocessKnowledgeDocument } from "../modules/knowledge-base/kb.service.js";
import { getObjectStorage } from "../common/storage.js";
import { env } from "../config/env.js";
import { saveKnowledgeChunkEmbedding } from "../modules/knowledge-base/kb.vector.js";
import { IngestionFailure } from "../common/operations.js";
jest.mock("../modules/knowledge-base/kb.vector.js", () => ({ ...jest.requireActual("../modules/knowledge-base/kb.vector.js"), saveKnowledgeChunkEmbedding: jest.fn(async () => true) }));
const prefix = "stage-i-" + Date.now();
const orgs: string[] = [], users: string[] = [], keys: string[] = [];
let seq = 0;
async function fixture() { const user = await prisma.user.create({ data: { email: prefix + (seq++) + "@test.invalid", name: "owner", passwordHash: "fixture" } }); users.push(user.id); const org = await prisma.organization.create({ data: { name: prefix, slug: prefix + seq, ownerId: user.id } }); orgs.push(org.id); await prisma.organizationMember.create({ data: { organizationId: org.id, userId: user.id, role: "OWNER" } }); return { user, org }; }
type F = Awaited<ReturnType<typeof fixture>>;
async function upload(f: F, text = "Refund policy documentation", documentId?: string) { const result = await createVersionRecord(f.user.id, f.org.id, { fileName: "ignored", originalName: "../../policy.txt", mimeType: "text/plain", sizeBytes: 0, bytes: Buffer.from(text), requestId: "stage-i-correlation" }, documentId); keys.push(result.version.storageRef); return result; }
async function reconcileAll() { let cursor: string | undefined; const findings = []; do {
    const page = await reconcileKnowledge(cursor);
    findings.push(...page.findings);
    cursor = page.cursor;
} while (cursor); return findings; }
afterEach(() => { jest.restoreAllMocks(); env.OPENAI_API_KEY = undefined; });
afterAll(async () => { await prisma.organization.deleteMany({ where: { id: { in: orgs } } }); await prisma.user.deleteMany({ where: { id: { in: users } } }); for (const key of keys)
    await getObjectStorage().delete(key); await prisma.$disconnect(); });
test("transactional intent survives Redis failure; dispatcher retries with stable identity and correlation", async () => {
    const f = await fixture(), v = await upload(f), sent = new Set<string>();
    const initial = await prisma.knowledgeOutbox.findFirstOrThrow({ where: { versionId: v.version.id } });
    expect(initial.requestId).toBe("stage-i-correlation");
    await dispatchKnowledgeOutbox(async () => { throw new Error("Redis offline"); });
    const pending = await prisma.knowledgeOutbox.findUniqueOrThrow({ where: { id: initial.id } });
    expect(pending.dispatchedAt).toBeNull();
    expect(pending.errorCategory).toBe("OUTBOX_DISPATCH_FAILED");
    await prisma.knowledgeOutbox.update({ where: { id: pending.id }, data: { availableAt: new Date(0) } });
    await dispatchKnowledgeOutbox(async (data) => { sent.add(knowledgeJobId(data.versionId, data.generation)); expect(data.requestId).toBe("stage-i-correlation"); });
    expect(sent.has(knowledgeJobId(v.version.id))).toBe(true);
    expect((await prisma.knowledgeOutbox.findUniqueOrThrow({ where: { id: initial.id } })).dispatchedAt).not.toBeNull();
});
test("enqueue succeeded but dispatch-mark failed: reclaim produces same logical job; competing dispatchers claim once", async () => {
    const f = await fixture(), v = await upload(f), logical = new Set<string>();
    let calls = 0;
    const update = jest.spyOn(prisma.knowledgeOutbox, "updateMany");
    update.mockRejectedValueOnce(new Error("commit acknowledgement failed"));
    await dispatchKnowledgeOutbox(async (d) => { logical.add(knowledgeJobId(d.versionId, d.generation)); calls++; });
    update.mockRestore();
    await prisma.knowledgeOutbox.updateMany({ where: { versionId: v.version.id }, data: { availableAt: new Date(0), claimUntil: null } });
    await Promise.all([dispatchKnowledgeOutbox(async (d) => { logical.add(knowledgeJobId(d.versionId, d.generation)); calls++; }), dispatchKnowledgeOutbox(async (d) => { logical.add(knowledgeJobId(d.versionId, d.generation)); calls++; })]);
    expect(logical.size).toBe(1);
    expect(calls).toBe(2);
});
test("duplicate worker execution keeps chunks, history and publication immutable", async () => {
    const f = await fixture(), v = await upload(f);
    await processKnowledgeDocument(f.org.id, v.document.id, v.version.id, 1);
    const chunks = await prisma.knowledgeChunk.findMany({ where: { documentVersionId: v.version.id } });
    expect((await processKnowledgeDocument(f.org.id, v.document.id, v.version.id, 1)).status).toBe("UNCHANGED");
    expect(await prisma.knowledgeChunk.findMany({ where: { documentVersionId: v.version.id } })).toEqual(chunks);
    expect(await prisma.knowledgeIngestionAttempt.count({ where: { versionId: v.version.id } })).toBe(1);
    await publishKnowledgeVersion(f.user.id, f.org.id, v.document.id, v.version.id, null);
    expect((await processKnowledgeDocument(f.org.id, v.document.id, v.version.id)).status).toBe("UNCHANGED");
});
(process.env.SUPPORTIQ_TEST_PGVECTOR === "1" ? test : test.skip)("transient provider failure retains chunks, prevents false READY, and retry recovers same version", async () => {
    const f = await fixture(), v = await upload(f, "refund policy ".repeat(1500));
    env.OPENAI_API_KEY = "mock-only";
    jest.mocked(saveKnowledgeChunkEmbedding).mockImplementation(async (id) => { await prisma.$executeRaw `UPDATE "KnowledgeChunk" SET embedding=${JSON.stringify([1, ...Array(1535).fill(0)])}::vector WHERE id=${id}`; return true; }).mockResolvedValueOnce(false);
    await expect(processKnowledgeDocument(f.org.id, v.document.id, v.version.id, 1)).rejects.toMatchObject({ category: "EMBEDDING_PROVIDER_FAILED", retryable: true });
    const first = await prisma.knowledgeChunk.findMany({ where: { documentVersionId: v.version.id }, orderBy: { chunkIndex: "asc" } });
    expect(first.length).toBeGreaterThan(1);
    expect(await prisma.knowledgeIngestion.findUnique({ where: { versionId: v.version.id } })).toMatchObject({ stage: "FAILED", semanticReady: false });
    await expect(publishKnowledgeVersion(f.user.id, f.org.id, v.document.id, v.version.id, null)).rejects.toThrow();
    await processKnowledgeDocument(f.org.id, v.document.id, v.version.id, 1);
    expect((await prisma.knowledgeChunk.findMany({ where: { documentVersionId: v.version.id }, orderBy: { chunkIndex: "asc" } })).map(c => c.id)).toEqual(first.map(c => c.id));
    expect(await prisma.knowledgeIngestion.findUnique({ where: { versionId: v.version.id } })).toMatchObject({ stage: "READY", attempts: 2, semanticReady: true });
});
test("stale processing is recovered once; current heartbeat not stolen; old generation cannot write", async () => {
    const f = await fixture(), v = await upload(f);
    await prisma.knowledgeDocumentVersion.update({ where: { id: v.version.id }, data: { status: "PROCESSING", processingToken: "dead-worker", leaseUntil: new Date(Date.now() + 60000) } });
    await prisma.knowledgeIngestion.update({ where: { versionId: v.version.id }, data: { stage: "EXTRACTING", heartbeatAt: new Date(), attempts: 1 } });
    await reconcileAll();
    expect((await prisma.knowledgeIngestion.findUniqueOrThrow({ where: { versionId: v.version.id } })).generation).toBe(1);
    await prisma.knowledgeDocumentVersion.update({ where: { id: v.version.id }, data: { leaseUntil: new Date(0) } });
    await reconcileAll();
    await reconcileAll();
    expect((await prisma.knowledgeIngestion.findUniqueOrThrow({ where: { versionId: v.version.id } })).generation).toBe(2);
    expect((await processKnowledgeDocument(f.org.id, v.document.id, v.version.id, 1)).status).toBe("UNCHANGED");
    await processKnowledgeDocument(f.org.id, v.document.id, v.version.id, 2);
});
test("missing outbox is repaired idempotently", async () => { const f = await fixture(), v = await upload(f); await prisma.knowledgeOutbox.deleteMany({ where: { versionId: v.version.id } }); await reconcileAll(); await reconcileAll(); expect(await prisma.knowledgeOutbox.count({ where: { versionId: v.version.id } })).toBe(1); });
test("missing/tampered source fails permanently; nonretryable cannot be manually retried", async () => {
    const f = await fixture(), v = await upload(f);
    await getObjectStorage().delete(v.version.storageRef);
    await expect(processKnowledgeDocument(f.org.id, v.document.id, v.version.id)).rejects.toMatchObject({ category: "SOURCE_MISSING", retryable: false });
    await expect(reprocessKnowledgeDocument(f.org.id, v.document.id, f.user.id, v.version.id)).rejects.toMatchObject({ statusCode: 409 });
    await reconcileAll();
    expect((await prisma.knowledgeIngestion.findUniqueOrThrow({ where: { versionId: v.version.id } })).stage).toBe("FAILED");
    const second = await upload(f, "new content", v.document.id);
    await getObjectStorage().delete(second.version.storageRef);
    await getObjectStorage().put(second.version.storageRef, Buffer.from("tampered"), "text/plain");
    await expect(processKnowledgeDocument(f.org.id, v.document.id, second.version.id)).rejects.toMatchObject({ category: "SOURCE_CHANGED" });
});
test("object write failure creates no version; DB failure compensates storage object", async () => {
    const f = await fixture(), storage = getObjectStorage();
    const put = jest.spyOn(storage, "put").mockRejectedValueOnce(new IngestionFailure("STORAGE_UNAVAILABLE", true));
    await expect(upload(f)).rejects.toMatchObject({ category: "STORAGE_UNAVAILABLE" });
    put.mockRestore();
    expect(await prisma.knowledgeDocument.count({ where: { organizationId: f.org.id } })).toBe(0);
    const remove = jest.spyOn(storage, "delete"), transaction = jest.spyOn(prisma, "$transaction").mockRejectedValueOnce(new Error("DB commit failed"));
    await expect(upload(f)).rejects.toThrow();
    expect(remove).toHaveBeenCalledTimes(1);
    expect(await storage.exists(remove.mock.calls[0]![0])).toBe(false);
    transaction.mockRestore();
});
test("READY commit failure cannot expose half-prepared knowledge", async () => {
    const f = await fixture(), v = await upload(f);
    await prisma.$executeRawUnsafe("CREATE FUNCTION stage_i_fail_ready() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.message='VERSION_PROCESSING_COMPLETED' THEN RAISE EXCEPTION 'injected'; END IF; RETURN NEW; END $$");
    await prisma.$executeRawUnsafe('CREATE TRIGGER stage_i_fail_ready BEFORE INSERT ON "ActivityLog" FOR EACH ROW EXECUTE FUNCTION stage_i_fail_ready()');
    try {
        await expect(processKnowledgeDocument(f.org.id, v.document.id, v.version.id)).rejects.toMatchObject({ category: "DATABASE_ERROR" });
    }
    finally {
        await prisma.$executeRawUnsafe('DROP TRIGGER stage_i_fail_ready ON "ActivityLog"');
        await prisma.$executeRawUnsafe('DROP FUNCTION stage_i_fail_ready()');
    }
    expect((await prisma.knowledgeDocumentVersion.findUniqueOrThrow({ where: { id: v.version.id } })).status).toBe("FAILED");
    expect((await prisma.knowledgeIngestion.findUniqueOrThrow({ where: { versionId: v.version.id } })).lexicalReady).toBe(false);
});
test("manual retry creates new generation and durable attempt without changing source identity", async () => {
    const f = await fixture(), v = await upload(f);
    const read = jest.spyOn(getObjectStorage(), "get").mockRejectedValueOnce(new IngestionFailure("STORAGE_UNAVAILABLE", true));
    await expect(processKnowledgeDocument(f.org.id, v.document.id, v.version.id)).rejects.toThrow();
    read.mockRestore();
    await reprocessKnowledgeDocument(f.org.id, v.document.id, f.user.id, v.version.id);
    await processKnowledgeDocument(f.org.id, v.document.id, v.version.id, 2);
    const stored = await prisma.knowledgeDocumentVersion.findUniqueOrThrow({ where: { id: v.version.id } });
    expect(stored.sourceHash).toBe(v.version.sourceHash);
    expect(stored.storageRef).toBe(v.version.storageRef);
    expect(await prisma.knowledgeIngestionAttempt.count({ where: { versionId: v.version.id } })).toBe(2);
});
(process.env.SUPPORTIQ_TEST_PGVECTOR === "1" ? test : test.skip)("100+ chunks: bounded mocked provider work, full index readiness, measured upload/dispatch/process/reconcile", async () => {
    const f = await fixture();
    env.OPENAI_API_KEY = "mock-only";
    let active = 0, maximum = 0;
    jest.mocked(saveKnowledgeChunkEmbedding).mockImplementation(async (id) => { active++; maximum = Math.max(maximum, active); try {
        await new Promise(resolve => setTimeout(resolve, 2));
        await prisma.$executeRaw `UPDATE "KnowledgeChunk" SET embedding=${JSON.stringify([1, ...Array(1535).fill(0)])}::vector WHERE id=${id}`;
        return true;
    }
    finally {
        active--;
    } });
    const t = performance.now(), v = await upload(f, Array.from({ length: 4000 }, (_, i) => "Policy paragraph " + i + " outlines refund eligibility, documents and support escalation steps. ").join("\n")), uploaded = performance.now();
    await dispatchKnowledgeOutbox(async () => { });
    const dispatched = performance.now();
    const result = await processKnowledgeDocument(f.org.id, v.document.id, v.version.id, 1);
    const processed = performance.now();
    await reconcileAll();
    const reconciled = performance.now();
    expect(result.chunkCount).toBeGreaterThanOrEqual(100);
    expect(maximum).toBeLessThanOrEqual(4);
    expect(result.embeddedChunkCount).toBe(result.chunkCount);
    console.log(JSON.stringify({ benchmark: "stage-i", chunks: result.chunkCount, uploadMs: uploaded - t, dispatchMs: dispatched - uploaded, processingMs: processed - dispatched, reconcileMs: reconciled - processed, maxConcurrentEmbeddings: maximum }));
}, 60000);
test("100+ chunks lexical ingestion and bounded reconciliation performance", async () => {
    const f = await fixture(), t = performance.now(), v = await upload(f, Array.from({ length: 4000 }, (_, i) => "Policy paragraph " + i + " outlines refund eligibility, documents and support escalation steps. ").join("\n")), uploaded = performance.now();
    await dispatchKnowledgeOutbox(async () => { });
    const dispatched = performance.now();
    const result = await processKnowledgeDocument(f.org.id, v.document.id, v.version.id, 1);
    const processed = performance.now();
    await reconcileAll();
    const reconciled = performance.now();
    expect(result.chunkCount).toBeGreaterThanOrEqual(100);
    expect(result.embeddedChunkCount).toBe(0);
    console.log(JSON.stringify({ benchmark: "stage-i-lexical", chunks: result.chunkCount, uploadMs: uploaded - t, dispatchMs: dispatched - uploaded, processingMs: processed - dispatched, reconcileMs: reconciled - processed }));
}, 60000);
test("dispatch exhaustion is visible and manual retry rearms a new intent", async () => {
    const f = await fixture(), v = await upload(f);
    await prisma.knowledgeOutbox.updateMany({ where: { versionId: v.version.id }, data: { attempts: 19, availableAt: new Date(0) } });
    await dispatchKnowledgeOutbox(async () => { throw new Error("offline"); }, 1);
    expect(await prisma.knowledgeIngestion.findUnique({ where: { versionId: v.version.id } })).toMatchObject({ stage: "FAILED", errorCategory: "QUEUE_UNAVAILABLE", retryable: true });
    await reprocessKnowledgeDocument(f.org.id, v.document.id, f.user.id, v.version.id);
    expect(await prisma.knowledgeOutbox.findUnique({ where: { versionId_generation: { versionId: v.version.id, generation: 2 } } })).not.toBeNull();
});
test("failed compensation leaves an orphan that is safely discoverable; inspection never deletes it", async () => {
    const f = await fixture(), storage = getObjectStorage(), put = jest.spyOn(storage, "put"), remove = jest.spyOn(storage, "delete").mockRejectedValueOnce(new Error("storage offline")), tx = jest.spyOn(prisma, "$transaction").mockRejectedValueOnce(new Error("DB offline"));
    await expect(upload(f)).rejects.toThrow();
    const key = put.mock.calls[0]![0];
    keys.push(key);
    expect(await storage.exists(key)).toBe(true);
    remove.mockRestore();
    tx.mockRestore();
    const list = jest.spyOn(storage, "list").mockResolvedValue({ objects: [{ key, modified: new Date(0) }] });
    const { inspectOrphanObjects } = await import("../modules/knowledge-base/kb.reconcile.js");
    expect((await inspectOrphanObjects()).candidates.map(c => c.key)).toContain(key);
    expect(await storage.exists(key)).toBe(true);
    list.mockRestore();
});
test("READY index inconsistency is reported without destructive repair", async () => {
    const f = await fixture(), v = await upload(f);
    await processKnowledgeDocument(f.org.id, v.document.id, v.version.id);
    await prisma.knowledgeChunk.deleteMany({ where: { documentVersionId: v.version.id } });
    expect((await reconcileAll()).some(r => r.versionId === v.version.id && r.category === "INDEX_INCOMPLETE" && !r.repaired)).toBe(true);
    await expect(publishKnowledgeVersion(f.user.id, f.org.id, v.document.id, v.version.id, null)).rejects.toMatchObject({ statusCode: 409 });
});
