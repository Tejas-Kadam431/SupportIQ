import { createRequire } from "node:module";
import path from "node:path";
import fs from "node:fs/promises";
import { randomUUID } from "node:crypto";
interface Client {
    connect(): Promise<void>;
    end(): Promise<void>;
    query(sql: string, values?: unknown[]): Promise<{
        rows: Record<string, unknown>[];
    }>;
}
const { Client } = createRequire(path.resolve('package.json'))('pg') as {
    Client: new (options: {
        connectionString?: string;
    }) => Client;
};
test('additive Stage G → H migration preserves publications, historical snapshots and decisions and issue history', async () => {
    const c = new Client({ connectionString: process.env.DATABASE_URL });
    await c.connect();
    const schema = 'stage_h_' + randomUUID().replaceAll('-', '');
    try {
        await c.query('CREATE SCHEMA "' + schema + '"');
        await c.query('SET search_path TO "' + schema + '",public');
        const dir = path.resolve('prisma/migrations'), names = (await fs.readdir(dir)).filter(n => /^20/.test(n)).sort();
        for (const n of names.filter(n => n < '20260929010000'))
            await c.query(await fs.readFile(path.join(dir, n, 'migration.sql'), 'utf8'));
        await c.query(`INSERT INTO "User"(id,email,name,"passwordHash","updatedAt") VALUES('u','g@test.invalid','Fixture','fixture',now());
 INSERT INTO "Organization"(id,name,slug,"ownerId","updatedAt") VALUES('o','Fixture','fixture','u',now());
 INSERT INTO "Ticket"(id,"organizationId","customerId",title,description,"updatedAt") VALUES('t','o','u','Refund','Refund',now());
 INSERT INTO "KnowledgeDocument"(id,"organizationId","uploadedById","fileName","originalName","mimeType","sizeBytes","storagePath","updatedAt") VALUES('d','o','u','Fixture','Fixture','text/plain',20,'fixture',now());
 INSERT INTO "KnowledgeDocumentVersion"(id,"documentId","versionNumber",status,"originalName","mimeType","sizeBytes","storageRef","contentHash","createdByIdentity","semanticIndexedChunks") VALUES('v','d',1,'READY','Fixture','text/plain',20,'fixture','hash','u',0);
 INSERT INTO "KnowledgeChunk"(id,"documentId","organizationId","documentVersionId",content,"contentHash","chunkIndex","tokenCount","updatedAt") VALUES('c','d','o','v','Refund policy',encode(sha256(convert_to('Refund policy','UTF8')),'hex'),0,3,now());
 UPDATE "KnowledgeDocumentVersion" SET status='PUBLISHED',"publishedAt"=now() WHERE id='v'; UPDATE "KnowledgeDocument" SET "currentPublishedVersionId"='v' WHERE id='d';
 INSERT INTO "CopilotRun"(id,"organizationId","ticketId",provider,confidence,tone,topic,"issueSummary","missingInformation","recommendedAction","searchQuery","searchMode","sourceCount",sources,warnings) VALUES('r','o','t','fallback','LOW','PROFESSIONAL','Refund','Refund','[]','Review','refund','keyword',1,'[{"documentVersionId":"v","chunkId":"c","content":"Refund policy"}]','[]');
 INSERT INTO "CopilotKnowledgeSource"("copilotRunId","documentVersionId","chunkId") VALUES('r','v','c');
 INSERT INTO "CopilotEvaluation"(id,"copilotRunId",disposition,reason,"updatedAt") VALUES('e','r','REJECTED','WRONG_KNOWLEDGE',now());`);
        await c.query(`INSERT INTO "KnowledgeIssue"(id,"organizationId","groupingKey","normalizedTopic",title,reason,"updatedAt") VALUES('issue','o','group','refund','Refund','WRONG_KNOWLEDGE',now()); INSERT INTO "KnowledgeIssueSignal"(id,"issueId","copilotRunId",reason,"classifierVersion","occurredAt") VALUES('signal','issue','r','WRONG_KNOWLEDGE','knowledge-signal-v1',now()); INSERT INTO "KnowledgeIssueSource"("signalId","documentVersionId",attributed) VALUES('signal','v',true); INSERT INTO "KnowledgeIssueHistory"(id,"issueId",event,metadata) VALUES('history','issue','DETECTED','{}');`);
        const tables = ['KnowledgeDocument', 'KnowledgeDocumentVersion', 'KnowledgeChunk', 'CopilotRun', 'CopilotKnowledgeSource', 'CopilotEvaluation', 'KnowledgeIssue', 'KnowledgeIssueSignal', 'KnowledgeIssueSource', 'KnowledgeIssueHistory'];
        const before = [];
        for (const t of tables)
            before.push((await c.query('SELECT row_to_json(t) AS value FROM "' + t + '" t')).rows);
        for (const n of names.filter(n => n >= '20260929010000'))
            await c.query(await fs.readFile(path.join(dir, n, 'migration.sql'), 'utf8'));
        for (let i = 0; i < tables.length; i++)
            expect((await c.query('SELECT row_to_json(t) AS value FROM "' + tables[i] + '" t')).rows).toEqual(before[i]);
        expect((await c.query('SELECT count(*)::int AS count FROM "EvaluationExperiment"')).rows[0].count).toBe(0);
    }
    finally {
        await c.query('SET search_path TO public');
        await c.query('DROP SCHEMA "' + schema + '" CASCADE');
        await c.end();
    }
}, 60000);
