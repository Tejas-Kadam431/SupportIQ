import { randomUUID } from "node:crypto";
import path from "node:path";
import fs from "node:fs/promises";
import { createRequire } from "node:module";
// pg is an existing runtime dependency; keep this test's SQL boundary explicitly typed.
interface MigrationClient {
    connect(): Promise<void>;
    end(): Promise<void>;
    query(sql: string, values?: unknown[]): Promise<{
        rows: Record<string, unknown>[];
        rowCount: number | null;
    }>;
}
const { Client } = createRequire(path.resolve("package.json"))("pg") as {
    Client: new (options: {
        connectionString?: string;
    }) => MigrationClient;
};
// Isolated schema exercises the actual full migration chain, including preserved vectors in CI.
test("Stage E to F backfill preserves IDs/content/embeddings/history and safely maps statuses", async () => {
    const client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    const schema = "stage_f_migration_" + randomUUID().replaceAll("-", "");
    try {
        await client.query('CREATE SCHEMA "' + schema + '"');
        await client.query('SET search_path TO "' + schema + '",public');
        const directory = path.resolve("prisma/migrations");
        const names = (await fs.readdir(directory)).filter(n => /^20/.test(n)).sort();
        for (const name of names.filter(n => n < "20260927010000"))
            await client.query(await fs.readFile(path.join(directory, name, "migration.sql"), "utf8"));
        await client.query(`INSERT INTO "User"(id,email,name,"passwordHash","updatedAt") VALUES('u','migration@test.invalid','Fixture','fixture',now()); INSERT INTO "Organization"(id,name,slug,"ownerId","updatedAt") VALUES('o','Fixture','fixture','u',now());`);
        for (const status of ["READY", "FAILED", "PROCESSING", "UPLOADED"]) {
            await client.query(`INSERT INTO "KnowledgeDocument"(id,"organizationId","uploadedById","fileName","originalName","mimeType","sizeBytes","storagePath",status,"updatedAt") VALUES($1,'o','u','fixture','Fixture','text/plain',10,'fixture',$2,now())`, [status, status]);
            if (status !== "UPLOADED")
                await client.query(`INSERT INTO "KnowledgeChunk"(id,"documentId","organizationId",content,"chunkIndex","tokenCount","updatedAt") VALUES($1,$2,'o','Original source',0,3,now())`, ["chunk-" + status, status]);
        }
        await client.query(`INSERT INTO "Ticket"(id,"organizationId","customerId",title,description,"updatedAt") VALUES('t','o','u','Fixture','Fixture',now());
  INSERT INTO "TicketMessage"(id,"ticketId","senderId",body,"updatedAt") VALUES('m','t','u','Original message',now());
  INSERT INTO "CopilotRun"(id,"organizationId","ticketId","triggeredById",provider,confidence,tone,topic,"issueSummary","missingInformation","recommendedAction","suggestedReply","searchQuery","searchMode","sourceCount",sources,warnings)
  VALUES('r','o','t','u','LOCAL','LOW','PROFESSIONAL','Fixture','Fixture','[]','Review','Original reply','query','keyword',1,'[{"chunkId":"chunk-READY","content":"Original source"}]','[]');
  INSERT INTO "CopilotEvaluation"(id,"copilotRunId","evaluatorId",disposition,"finalMessage","updatedAt") VALUES('e','r','u','ACCEPTED','Original reply',now());`);
        const historyBefore = [];
        for (const table of ['CopilotRun', 'CopilotEvaluation', 'TicketMessage']) historyBefore.push((await client.query('SELECT * FROM "' + table + '" ORDER BY id')).rows);
        const hasVector = (await client.query("SELECT 1 FROM pg_extension WHERE extname='vector'")).rowCount! > 0;
        if (process.env.SUPPORTIQ_TEST_PGVECTOR === "1")
            expect(hasVector).toBe(true);
        let vectorBefore: string | null = null;
        if (hasVector) {
            const vector = JSON.stringify([1, ...Array(1535).fill(0)]);
            await client.query('UPDATE "KnowledgeChunk" SET embedding=$1::vector WHERE id=$2', [vector, 'chunk-READY']);
            vectorBefore = (await client.query('SELECT embedding::text AS value FROM "KnowledgeChunk" WHERE id=$1', ['chunk-READY'])).rows[0].value as string;
        }
        const before = (await client.query('SELECT id,content,"documentId" FROM "KnowledgeChunk" ORDER BY id')).rows;
        for (const name of names.filter(n => n >= "20260927010000"))
            await client.query(await fs.readFile(path.join(directory, name, "migration.sql"), "utf8"));
        const historyAfter = [];
        for (const table of ['CopilotRun', 'CopilotEvaluation', 'TicketMessage']) historyAfter.push((await client.query('SELECT * FROM "' + table + '" ORDER BY id')).rows);
        expect(historyAfter).toEqual(historyBefore);
        expect((await client.query('SELECT count(*)::int AS count FROM "KnowledgeDocument"')).rows[0].count).toBe(4);
        expect((await client.query('SELECT id,content,"documentId" FROM "KnowledgeChunk" ORDER BY id')).rows).toEqual(before);
        const versions = (await client.query('SELECT "documentId",status,"versionNumber","sourceHash" FROM "KnowledgeDocumentVersion" ORDER BY "documentId"')).rows;
        expect(versions).toEqual([{ documentId: "FAILED", status: "FAILED", versionNumber: 1, sourceHash: null }, { documentId: "PROCESSING", status: "UPLOADED", versionNumber: 1, sourceHash: null }, { documentId: "READY", status: "PUBLISHED", versionNumber: 1, sourceHash: null }, { documentId: "UPLOADED", status: "UPLOADED", versionNumber: 1, sourceHash: null }]);
        expect((await client.query('SELECT "currentPublishedVersionId" FROM "KnowledgeDocument" WHERE id=$1', ['READY'])).rows[0].currentPublishedVersionId).toBe('legacy-version-READY');
        expect((await client.query('SELECT count(*)::int AS count FROM "KnowledgeChunk" c JOIN "KnowledgeDocumentVersion" v ON v.id=c."documentVersionId" WHERE c."documentId"=v."documentId"')).rows[0].count).toBe(3);
        if (hasVector)
            expect((await client.query('SELECT embedding::text AS value FROM "KnowledgeChunk" WHERE id=$1', ['chunk-READY'])).rows[0].value).toBe(vectorBefore);
    }
    finally {
        await client.query('SET search_path TO public');
        await client.query('DROP SCHEMA IF EXISTS "' + schema + '" CASCADE');
        await client.end();
    }
}, 60000);
