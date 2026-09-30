import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import express from "express";
import request from "supertest";
import { FileObjectStorage, objectKey, validateKey } from "../common/storage.js";
import { validateKnowledgeBytes } from "../modules/knowledge-base/kb.validation.js";
import { redact, requestId, requestContext, log } from "../common/operations.js";
import { knowledgeJobId } from "../modules/knowledge-base/kb.outbox.js";
import { boundedShutdown } from "../common/shutdown.js";
import { componentState } from "../modules/health/readiness.js";
const root = path.join(os.tmpdir(), "supportiq-storage-" + requestId(undefined));
afterAll(async () => { await fs.rm(root, { recursive: true, force: true }); });
test.each([["a.pdf", "text/plain"], ["a.txt", "application/pdf"], ["a.exe", "text/plain"], ["a.md", "application/octet-stream"]])("rejects mismatched extension/MIME %s %s", async (name, mime) => { await expect(validateKnowledgeBytes(Buffer.from("hello"), name, mime)).rejects.toMatchObject({ category: "INVALID_FILE", retryable: false }); });
test("rejects PDF spoof, malformed PDF, binary and invalid UTF8", async () => {
    await expect(validateKnowledgeBytes(Buffer.from("not pdf"), "a.pdf", "application/pdf")).rejects.toMatchObject({ category: "INVALID_FILE" });
    await expect(validateKnowledgeBytes(Buffer.from("%PDF-1.7 garbage"), "a.pdf", "application/pdf")).rejects.toMatchObject({ category: "PARSE_FAILED" });
    for (const bytes of [Buffer.from([0, 2]), Buffer.from([255]), Buffer.alloc(0), Buffer.alloc(11 * 1024 * 1024, 65)])
        await expect(validateKnowledgeBytes(bytes, "a.txt", "text/plain")).rejects.toMatchObject({ category: "INVALID_FILE" });
});
test("accepts bounded UTF8 TXT/MD and valid PDF", async () => {
    expect(await validateKnowledgeBytes(Buffer.from("Hello policy"), "../../policy.md", "text/markdown")).toBe("Hello policy");
    const parts = ["%PDF-1.4\n"], offsets = [0];
    const objects = ["<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R] /Count 1 >>", "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 300] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>", "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"];
    const stream = "BT /F1 12 Tf 20 200 Td (Policy document) Tj ET";
    objects.push("<< /Length " + stream.length + " >>\nstream\n" + stream + "\nendstream");
    for (let i = 0; i < objects.length; i++) {
        offsets.push(Buffer.byteLength(parts.join("")));
        parts.push((i + 1) + " 0 obj\n" + objects[i] + "\nendobj\n");
    }
    const start = Buffer.byteLength(parts.join(""));
    parts.push("xref\n0 6\n0000000000 65535 f \n" + offsets.slice(1).map(n => String(n).padStart(10, "0") + " 00000 n \n").join("") + "trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n" + start + "\n%%EOF");
    expect(await validateKnowledgeBytes(Buffer.from(parts.join("")), "a.pdf", "application/pdf")).toContain("Policy document");
});
test("filesystem round trip uses server key; rejects traversal and detects missing objects", async () => {
    const storage = new FileObjectStorage(root), key = objectKey();
    expect(key).not.toContain("policy");
    await storage.put(key, Buffer.from("policy"));
    expect(await storage.get(key)).toEqual(Buffer.from("policy"));
    expect(await storage.exists(key)).toBe(true);
    expect((await storage.list()).objects[0]?.key).toBe(key);
    for (const bad of ["../secret", "knowledge/../../secret", "C:/secret", "knowledge/a/b"])
        expect(() => validateKey(bad)).toThrow();
    await storage.delete(key);
    expect(await storage.exists(key)).toBe(false);
    await expect(storage.get(key)).rejects.toMatchObject({ category: "SOURCE_MISSING", retryable: false });
});
test("job identity stable and generation separated, without forbidden colon", () => { expect(knowledgeJobId("version1", 2)).toBe(knowledgeJobId("version1", 2)); expect(knowledgeJobId("version1", 1)).not.toBe(knowledgeJobId("version1", 2)); expect(knowledgeJobId("version1")).not.toContain(":"); expect(() => knowledgeJobId("evil:identity")).toThrow(); });
test("redacts secrets, headers, prompts, customer content and raw errors", () => {
    const data = { password: "secret", accessToken: "token", refreshToken: "refresh", tokenHash: "hash", cookie: "session", Authorization: "Bearer token", apiKey: "key", prompt: "raw prompt", document: "raw doc", customer: { body: "content" }, requestId: "safe-request-123", category: "raw error with secret" };
    const safe = JSON.stringify(redact(data));
    for (const value of ["secret", "Bearer token", "raw prompt", "raw doc", "raw error with secret"])
        expect(safe).not.toContain(value);
    expect(safe).toContain("safe-request-123");
    const spy = jest.spyOn(console, "log").mockImplementation(() => { });
    log("knowledge.failed", data);
    expect(String(spy.mock.calls[0])).not.toContain("raw prompt");
    spy.mockRestore();
});
test("HTTP accepts bounded request IDs, generates replacements for invalid input", async () => { const app = express(); app.use(requestContext); app.get("/", (_req, res) => res.sendStatus(200)); expect((await request(app).get("/").set("x-request-id", "safe-request-123")).headers["x-request-id"]).toBe("safe-request-123"); const result = await request(app).get("/").set("x-request-id", "invalid request id"); expect(result.headers["x-request-id"]).toMatch(/^[a-f0-9-]{36}$/); expect(requestId("x".repeat(1000))).toHaveLength(36); });
test("readiness fails safely on rejection and timeout", async () => { expect(await componentState(async () => { throw new Error("secret database URL"); })).toBe("unavailable"); expect(await componentState(() => new Promise(() => { }), 5)).toBe("unavailable"); expect(await componentState(async () => 1)).toBe("ready"); });
test("shutdown closes resources and bounds stuck work", async () => { const closed: string[] = []; expect(await boundedShutdown(async () => { closed.push("http", "socket", "queue", "redis", "prisma"); }, () => closed.push("forced"))).toBe("closed"); expect(closed).toHaveLength(5); expect(await boundedShutdown(() => new Promise(() => { }), () => closed.push("forced"), 5)).toBe("forced"); expect(closed.at(-1)).toBe("forced"); });
