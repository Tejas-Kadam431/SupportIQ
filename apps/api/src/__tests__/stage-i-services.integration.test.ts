import { S3Client, CreateBucketCommand, DeleteBucketCommand } from "@aws-sdk/client-s3";
import { Queue } from "bullmq";
import { S3ObjectStorage, objectKey } from "../common/storage.js";
import { prisma } from "../config/prisma.js";
import { createVersionRecord } from "../modules/knowledge-base/kb.version.service.js";
import { dispatchKnowledgeOutbox, knowledgeJobId } from "../modules/knowledge-base/kb.outbox.js";
import { getKnowledgeQueue, startKnowledgeProcessingWorker, closeKnowledgeProcessingResources } from "../modules/knowledge-base/kb.queue.js";
import { readiness } from "../modules/health/readiness.js";
const s3test = process.env.SUPPORTIQ_TEST_S3 === "1" ? test : test.skip;
const redisTest = process.env.SUPPORTIQ_TEST_REDIS === "1" ? test : test.skip;
s3test("real private S3 adapter put/read/head/list/delete and missing key behavior", async () => {
    const endpoint = process.env.S3_TEST_ENDPOINT!;
    const client = new S3Client({ endpoint, region: "us-east-1", forcePathStyle: true, credentials: { accessKeyId: "supportiq-test", secretAccessKey: "isolated-test-only" }, maxAttempts: 1 });
    const bucket = "supportiq-test-" + Date.now(), storage = new S3ObjectStorage(client, bucket), key = objectKey();
    await client.send(new CreateBucketCommand({ Bucket: bucket }));
    try {
        await storage.put(key, Buffer.from("Private refund policy"), "text/plain");
        expect(await storage.get(key)).toEqual(Buffer.from("Private refund policy"));
        expect(await storage.exists(key)).toBe(true);
        expect((await storage.list()).objects.map(o => o.key)).toContain(key);
        expect((await fetch(endpoint + "/" + bucket + "/" + key)).status).toBe(403);
        await storage.delete(key);
        expect(await storage.exists(key)).toBe(false);
        await expect(storage.get(key)).rejects.toMatchObject({ category: "SOURCE_MISSING" });
    }
    finally {
        await storage.delete(key);
        await client.send(new DeleteBucketCommand({ Bucket: bucket }));
        client.destroy();
    }
}, 60000);
redisTest("real BullMQ duplicate job IDs, persisted intent during Redis outage, worker completion and resource closure", async () => {
    const stamp = "stage-i-redis-" + Date.now(), user = await prisma.user.create({ data: { name: stamp, email: stamp + "@test.invalid", passwordHash: "fixture" } }), org = await prisma.organization.create({ data: { name: stamp, slug: stamp, ownerId: user.id } });
    await prisma.organizationMember.create({ data: { organizationId: org.id, userId: user.id, role: "OWNER" } });
    const dead = new Queue("stage-i-unavailable", { connection: { host: "127.0.0.1", port: 1, connectTimeout: 200, maxRetriesPerRequest: 0, enableOfflineQueue: false, retryStrategy: () => null } });
    dead.on("error", () => { });
    try {
        const v = await createVersionRecord(user.id, org.id, { fileName: "ignored", originalName: "policy.txt", mimeType: "text/plain", sizeBytes: 10, bytes: Buffer.from("Refund policy document") });
        await dispatchKnowledgeOutbox(data => dead.add("process-document", data, { jobId: knowledgeJobId(data.versionId, data.generation) }));
        const outbox = await prisma.knowledgeOutbox.findFirstOrThrow({ where: { versionId: v.version.id } });
        expect(outbox.dispatchedAt).toBeNull();
        await prisma.knowledgeOutbox.update({ where: { id: outbox.id }, data: { availableAt: new Date(0) } });
        await dispatchKnowledgeOutbox();
        const queue = getKnowledgeQueue();
        const first = await queue.getJob(knowledgeJobId(v.version.id));
        expect(first).toBeTruthy();
        const duplicate = await queue.add("process-document", first!.data, { jobId: first!.id });
        expect(duplicate.id).toBe(first!.id);
        startKnowledgeProcessingWorker();
        const deadline = Date.now() + 15000;
        let stage = "";
        while (Date.now() < deadline) {
            stage = (await prisma.knowledgeIngestion.findUniqueOrThrow({ where: { versionId: v.version.id } })).stage;
            if (stage === "READY" || stage === "FAILED")
                break;
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        expect(stage).toBe("READY");
        expect(await prisma.knowledgeIngestionAttempt.count({ where: { versionId: v.version.id } })).toBe(1);
        expect((await readiness()).components).toEqual({ database: "ready", redis: "ready", storage: "ready" });
        await closeKnowledgeProcessingResources();
    }
    finally {
        await dead.close();
        await closeKnowledgeProcessingResources();
        await prisma.organization.delete({ where: { id: org.id } });
        await prisma.user.delete({ where: { id: user.id } });
        await prisma.$disconnect();
    }
}, 60000);
