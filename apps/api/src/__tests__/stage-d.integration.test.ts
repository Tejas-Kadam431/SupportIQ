import { createSeedKnowledge } from "../../prisma/seedKnowledge.js";
import express from "express";
import request from "supertest";
import { prisma } from "../config/prisma.js";
import { generateAiDraftReply } from "../modules/ai/ai.service.js";
import { generateWithProviders } from "../modules/ai/ai.provider.js";
import { evaluateCopilotRun, getCopilotRun, sendCopilotResponse } from "../modules/ai/ai.decision.js";
import { aiRoutes } from "../modules/ai/ai.routes.js";
import { errorHandler } from "../common/errors/errorHandler.js";
import { signAccessToken } from "../common/utils/jwt.js";
import { getOrganizationDashboard } from "../modules/dashboard/dashboard.service.js";
import * as realtime from "../modules/realtime/realtime.service.js";

// Actual PostgreSQL, retrieval, services and HTTP routes. Only generation is mocked.
jest.mock("../modules/ai/ai.provider.js", () => ({ generateWithProviders: jest.fn() }));
const prefix = `stage-d-${Date.now()}-${Math.random().toString(16).slice(2)}`;
let sequence = 0;
const users: string[] = [], organizations: string[] = [];
const app = express(); app.use(express.json()); app.use("/tickets", aiRoutes); app.use(errorHandler);
const original = "Reset your password from account settings.";
beforeEach(() => {
  (generateWithProviders as jest.Mock).mockImplementation(async (prompt: string) => ({
    draft: original, rawDraft: ` ${original}\n`, provider: "gemini", model: "gemini-fixture-v1",
    attempts: [{ provider: "gemini", model: "gemini-fixture-v1", outcome: "SUCCEEDED", reason: null, durationMs: 1, usage: null, resolvedModel: null }],
    requests: [{ provider: "gemini", model: "gemini-fixture-v1", prompt, systemPrompt: null, temperature: null, maxOutputTokens: 2048 }], fallbackReason: null
  }));
});
afterAll(async () => {
  await prisma.organization.deleteMany({ where: { id: { in: organizations } } });
  await prisma.user.deleteMany({ where: { id: { in: users } } });
  await prisma.$disconnect();
});

async function fixture(knowledge = true) {
  const key = sequence++;
  const people = await Promise.all(["OWNER", "AGENT", "CUSTOMER"].map(async role => {
    const user = await prisma.user.create({ data: { email: `${prefix}-${key}-${role}@test.invalid`, name: role, passwordHash: "fixture" } });
    users.push(user.id); return user;
  }));
  const [owner, agent, customer] = people;
  const org = await prisma.organization.create({ data: { name: prefix, slug: `${prefix}-${key}`, ownerId: owner.id } });
  organizations.push(org.id);
  await prisma.organizationMember.createMany({ data: people.map((user, i) => ({ userId: user.id, organizationId: org.id, role: (["OWNER", "AGENT", "CUSTOMER"] as const)[i] })) });
  const ticket = await prisma.ticket.create({ data: { organizationId: org.id, customerId: customer.id, title: "Password reset", description: "Password reset email account help" } });
  let documentId: string | null = null;
  if (knowledge) {
    const doc = await createSeedKnowledge(prisma,{data:{organizationId:org.id,uploadedById:owner.id,fileName:"fixture.txt",originalName:"Password guidance",mimeType:"text/plain",sizeBytes:100,storagePath:"fixture-only",status:"READY",
      chunks:{create:[{organizationId:org.id,chunkIndex:0,tokenCount:10,content:"Password reset email account help.\n1. Open account settings.\n2. Select reset password."}]}}});
    documentId=doc.id;
  }
  return { owner, agent, customer, org, ticket, documentId };
}
async function generate(f: Awaited<ReturnType<typeof fixture>>) {
  const result = await generateAiDraftReply(f.agent.id, f.ticket.id, { tone: "PROFESSIONAL" });
  expect(result.runId).not.toBeNull(); return result.runId!;
}
async function withInsertFailure(table: "CopilotEvaluation" | "TicketMessage" | "ActivityLog" | "CopilotRun", action: () => Promise<void>) {
  await prisma.$executeRawUnsafe(`CREATE FUNCTION stage_d_fail_insert() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected test failure'; END $$`);
  await prisma.$executeRawUnsafe(`CREATE TRIGGER stage_d_fail_insert BEFORE INSERT ON "${table}" FOR EACH ROW EXECUTE FUNCTION stage_d_fail_insert()`);
  try { await action(); } finally {
    await prisma.$executeRawUnsafe(`DROP TRIGGER stage_d_fail_insert ON "${table}"`);
    await prisma.$executeRawUnsafe(`DROP FUNCTION stage_d_fail_insert()`);
  }
}

test.each([[original, "ACCEPTED"], ["Edited answer", "EDITED"], [` \n${original}\t`, "ACCEPTED"]])("atomic send classifies %j as %s and links authoritative message", async (finalMessage, disposition) => {
  const f = await fixture(); const runId = await generate(f);
  const result = await sendCopilotResponse(f.agent.id, f.ticket.id, runId, { finalMessage });
  expect(result.evaluation).toMatchObject({ disposition, messageId: result.message!.id, originalReply: original,
    finalMessage: result.message!.body, evaluatorIdentity: f.agent.id, evaluatorId: f.agent.id });
  expect(result.message!.body).toBe(finalMessage.trim());
  const ticket = await prisma.ticket.findUniqueOrThrow({ where: { id: f.ticket.id } });
  expect(ticket.firstResponseAt).toEqual(result.message!.createdAt);
  const activity = await prisma.activityLog.findFirstOrThrow({ where: { ticketId: f.ticket.id, type: "MESSAGE_SENT" } });
  expect(activity.metadata).toMatchObject({ messageId: result.message!.id });
});

test.each(["CopilotEvaluation", "TicketMessage", "ActivityLog"] as const)("failed %s INSERT rolls back message, decision, first response and activity", async table => {
  const f = await fixture(); const runId = await generate(f);
  await withInsertFailure(table, async () => {
    await expect(sendCopilotResponse(f.agent.id, f.ticket.id, runId, { finalMessage: original })).rejects.toMatchObject({ statusCode: 503 });
  });
  expect(await prisma.ticketMessage.count({ where: { ticketId: f.ticket.id } })).toBe(0);
  expect(await prisma.copilotEvaluation.count({ where: { copilotRunId: runId } })).toBe(0);
  expect(await prisma.activityLog.count({ where: { ticketId: f.ticket.id, type: "MESSAGE_SENT" } })).toBe(0);
  expect((await prisma.ticket.findUniqueOrThrow({ where: { id: f.ticket.id } })).firstResponseAt).toBeNull();
});

test.each(["ActivityLog", "CopilotRun"] as const)("generation %s failure leaves neither run nor generation audit", async table => {
  const f = await fixture();
  await withInsertFailure(table, async () => {
    await expect(generateAiDraftReply(f.agent.id, f.ticket.id, { tone: "PROFESSIONAL" })).rejects.toMatchObject({ statusCode: 503 });
  });
  expect(await prisma.copilotRun.count({ where: { ticketId: f.ticket.id } })).toBe(0);
  expect(await prisma.activityLog.count({ where: { ticketId: f.ticket.id } })).toBe(0);
});

test("realtime failure is post-commit and cannot fail durable send", async () => {
  const f = await fixture(); const runId = await generate(f);
  let committed = false;
  const emit = jest.spyOn(realtime, "emitTicketMessageCreated").mockImplementation(async () => {
    committed = await prisma.copilotEvaluation.count({ where: { copilotRunId: runId } }) === 1;
    throw new Error("private failure");
  });
  const log = jest.spyOn(console, "error").mockImplementation(() => {});
  try {
    const result = await sendCopilotResponse(f.agent.id, f.ticket.id, runId, { finalMessage: original });
    expect(result.message).not.toBeNull();
    await new Promise<void>((resolve, reject) => {
      const start = Date.now(); const check = () => {
        if (committed) resolve(); else if (Date.now() - start > 2000) reject(new Error("notification did not run")); else setTimeout(check, 10);
      }; check();
    });
    expect(committed).toBe(true); expect(emit).toHaveBeenCalledTimes(1);
  } finally { emit.mockRestore(); log.mockRestore(); }
});

test("concurrent exact retries return one message; conflicting retries and another evaluator conflict", async () => {
  const f = await fixture(); const runId = await generate(f);
  const results = await Promise.all([1, 2].map(() => sendCopilotResponse(f.agent.id, f.ticket.id, runId, { finalMessage: original })));
  expect(results[0].message!.id).toBe(results[1].message!.id);
  expect(results.map(result => result.replayed).sort()).toEqual([false, true]);
  expect(await prisma.ticketMessage.count({ where: { ticketId: f.ticket.id } })).toBe(1);
  await expect(sendCopilotResponse(f.agent.id, f.ticket.id, runId, { finalMessage: "Different" })).rejects.toMatchObject({ statusCode: 409 });
  await expect(sendCopilotResponse(f.owner.id, f.ticket.id, runId, { finalMessage: original })).rejects.toMatchObject({ statusCode: 409 });
});

test("rejection creates no message, is retry-safe, and cannot become acceptance", async () => {
  const f = await fixture(); const runId = await generate(f);
  const input = { disposition: "REJECTED" as const, reason: "WRONG_KNOWLEDGE" as const };
  const rejected = await evaluateCopilotRun(f.agent.id, f.ticket.id, runId, input);
  expect((await evaluateCopilotRun(f.agent.id, f.ticket.id, runId, input)).id).toBe(rejected.id);
  expect(rejected.messageId).toBeNull(); expect(rejected.finalMessage).toBeNull();
  expect(await prisma.ticketMessage.count({ where: { ticketId: f.ticket.id } })).toBe(0);
  await expect(sendCopilotResponse(f.agent.id, f.ticket.id, runId, { finalMessage: original })).rejects.toMatchObject({ statusCode: 409 });
  await expect(evaluateCopilotRun(f.agent.id, f.ticket.id, runId, { ...input, reason: "OTHER" })).rejects.toMatchObject({ statusCode: 409 });
});

test("ticket/tenant/customer boundaries apply to send, reject, read and generation", async () => {
  const f = await fixture(), other = await fixture(); const runId = await generate(f);
  const second = await prisma.ticket.create({ data: { organizationId: f.org.id, customerId: f.customer.id, title: "Other", description: "Other ticket" } });
  await expect(sendCopilotResponse(f.agent.id, second.id, runId, { finalMessage: original })).rejects.toMatchObject({ statusCode: 404 });
  await expect(sendCopilotResponse(other.agent.id, other.ticket.id, runId, { finalMessage: original })).rejects.toMatchObject({ statusCode: 404 });
  await expect(getCopilotRun(other.agent.id, other.ticket.id, runId)).rejects.toMatchObject({ statusCode: 404 });
  await expect(evaluateCopilotRun(other.agent.id, other.ticket.id, runId, { disposition: "REJECTED", reason: "OTHER" })).rejects.toMatchObject({ statusCode: 404 });
  for (const action of [
    () => sendCopilotResponse(f.customer.id, f.ticket.id, runId, { finalMessage: original }),
    () => evaluateCopilotRun(f.customer.id, f.ticket.id, runId, { disposition: "REJECTED", reason: "OTHER" }),
    () => getCopilotRun(f.customer.id, f.ticket.id, runId),
    () => generateAiDraftReply(f.customer.id, f.ticket.id, { tone: "PROFESSIONAL" })
  ]) await expect(action()).rejects.toMatchObject({ statusCode: 403 });
});

test("abstention skips provider output but retains inputs and cannot send; stale context requires regeneration", async () => {
  const empty = await fixture(false); const abstained = await generate(empty);
  const run = await getCopilotRun(empty.agent.id, empty.ticket.id, abstained);
  expect(run).toMatchObject({ status: "ABSTAINED", abstained: true, suggestedReply: null, evidencePolicyVersion: "evidence-v2" });
  expect(run.outputSnapshot).toMatchObject({ generatedDraft: null, suggestedReply: null });
  expect(run.providerMetadata).toMatchObject({ providerGenerationSkipped: true });
  await expect(sendCopilotResponse(empty.agent.id, empty.ticket.id, abstained, { finalMessage: original })).rejects.toMatchObject({ statusCode: 409 });
  const f = await fixture(); const runId = await generate(f);
  await prisma.ticketMessage.create({ data: { ticketId: f.ticket.id, senderId: f.customer.id, body: "New context" } });
  await expect(sendCopilotResponse(f.agent.id, f.ticket.id, runId, { finalMessage: original })).rejects.toMatchObject({ statusCode: 409 });
});

test("latest ten messages and evidence remain explainable after live ticket/knowledge changes", async () => {
  const f = await fixture(); const createdAt = new Date("2026-01-01");
  for (let i = 0; i < 13; i++) await prisma.ticketMessage.create({ data: { id: `${prefix}-msg-${String(i).padStart(2, "0")}`,
    ticketId: f.ticket.id, senderId: f.customer.id, body: `Message ${i}`, createdAt } });
  const runId = await generate(f); const run = await getCopilotRun(f.agent.id, f.ticket.id, runId);
  const input = run.inputSnapshot as { conversation: Array<{ content: string }>; retrievalQuery: string };
  expect(input.conversation.map(message => message.content)).toEqual(Array.from({ length: 10 }, (_, i) => `Message ${i + 3}`));
  const prompt = (run.promptSnapshot as { renderedPrompt: string }).renderedPrompt;
  expect(prompt.indexOf("Message 3")).toBeLessThan(prompt.indexOf("Message 12")); expect(prompt).not.toContain("CUSTOMER: Message 0");
  expect(run).toMatchObject({ provenanceVersion: 1, promptVersion: "support-copilot-v3", model: "gemini-fixture-v1",
    retrievalVersion: "hybrid-rrf-published-v2", evidencePolicyVersion: "evidence-v2", generationPath: "MODEL" });
  expect(input.retrievalQuery).toBe(run.searchQuery);
  expect(run.sources).toEqual(expect.arrayContaining([expect.objectContaining({ rank: 1, documentId: f.documentId, content: expect.stringContaining("Open account settings"), contentHash: expect.stringMatching(/^[a-f0-9]{64}$/) })]));
  expect(run.generationDurationMs).toBeGreaterThanOrEqual(0);
  await prisma.ticket.update({ where: { id: f.ticket.id }, data: { description: "Changed later" } });
  await prisma.ticketMessage.updateMany({ where: { ticketId: f.ticket.id }, data: { body: "Edited live history" } });
  await prisma.knowledgeDocument.update({ where: { id: f.documentId! }, data:{archivedAt:new Date()} });
  const historical = await getCopilotRun(f.agent.id, f.ticket.id, runId);
  expect(historical.inputSnapshot).toEqual(run.inputSnapshot); expect(historical.sources).toEqual(run.sources);
});

test("DB forbids overwriting decisions, original suggestions and linked sent messages", async () => {
  const f = await fixture(); const runId = await generate(f);
  const result = await sendCopilotResponse(f.agent.id, f.ticket.id, runId, { finalMessage: original });
  await expect(prisma.copilotRun.update({ where: { id: runId }, data: { suggestedReply: "Altered" } })).rejects.toThrow();
  await expect(prisma.copilotEvaluation.update({ where: { id: result.evaluation.id }, data: { disposition: "REJECTED" } })).rejects.toThrow();
  await expect(prisma.ticketMessage.update({ where: { id: result.message!.id }, data: { body: "Altered" } })).rejects.toThrow();
  await expect(prisma.ticketMessage.delete({ where: { id: result.message!.id } })).rejects.toThrow();
  expect((await getCopilotRun(f.agent.id, f.ticket.id, runId)).evaluation?.finalMessage).toBe(original);
});

test("HTTP rejects client disposition, reports replay and restricts history reads", async () => {
  const f = await fixture(); const runId = await generate(f); const base = `/tickets/${f.ticket.id}/copilot-runs/${runId}`;
  const auth = { Authorization: `Bearer ${signAccessToken(f.agent.id)}` };
  await request(app).post(`${base}/send`).set(auth).send({ finalMessage: original, disposition: "ACCEPTED" }).expect(400);
  await request(app).put(`${base}/evaluation`).set(auth).send({ disposition: "ACCEPTED", finalMessage: original }).expect(400);
  await request(app).post(`${base}/send`).set(auth).send({ finalMessage: original }).expect(201);
  await request(app).post(`${base}/send`).set(auth).send({ finalMessage: original }).expect(200);
  const response = await request(app).get(base).set(auth).expect(200);
  expect(response.body.data.run.evaluation.message.body).toBe(original);
  await request(app).get(base).set("Authorization", `Bearer ${signAccessToken(f.customer.id)}`).expect(403);
});

test("demo generation stays ephemeral and new decision routes remain guarded", async () => {
  const f = await fixture(); const runId = await generate(f); const previous = process.env.DEMO_READONLY_EMAILS;
  process.env.DEMO_READONLY_EMAILS = f.agent.email;
  try {
    expect((await generateAiDraftReply(f.agent.id, f.ticket.id, { tone: "PROFESSIONAL" })).runId).toBeNull();
    expect(await prisma.copilotRun.count({ where: { ticketId: f.ticket.id } })).toBe(1);
    const auth = { Authorization: `Bearer ${signAccessToken(f.agent.id)}` };
    await request(app).post(`/tickets/${f.ticket.id}/copilot-runs/${runId}/send`).set(auth).send({ finalMessage: original }).expect(403);
    await request(app).put(`/tickets/${f.ticket.id}/copilot-runs/${runId}/evaluation`).set(auth).send({ disposition: "REJECTED", reason: "OTHER" }).expect(403);
  } finally { if (previous === undefined) delete process.env.DEMO_READONLY_EMAILS; else process.env.DEMO_READONLY_EMAILS = previous; }
});

test("analytics still count one terminal decision per run and organization cascade remains explicit", async () => {
  const f = await fixture();
  const accepted = await generate(f); await sendCopilotResponse(f.agent.id, f.ticket.id, accepted, { finalMessage: original });
  const edited = await generate(f); await sendCopilotResponse(f.agent.id, f.ticket.id, edited, { finalMessage: "Edited" });
  const rejected = await generate(f); await evaluateCopilotRun(f.agent.id, f.ticket.id, rejected, { disposition: "REJECTED", reason: "INSUFFICIENT_KB" });
  const dashboard = await getOrganizationDashboard(f.agent.id, f.org.id);
  expect(dashboard.aiQuality).toMatchObject({ totalRuns: 3, evaluatedRuns: 3, accepted: 1, edited: 1, rejected: 1, acceptanceRate: 33 });
  expect(dashboard.aiQuality.failureReasons).toMatchObject({ INSUFFICIENT_KB: 1 });
  expect(dashboard.aiQuality.knowledgeGaps).toHaveLength(1);
  expect(dashboard.aiQuality.sourceQuality).toHaveLength(1);
  await prisma.organization.delete({ where: { id: f.org.id } });
  expect(await prisma.copilotRun.count({ where: { organizationId: f.org.id } })).toBe(0);
});

test("concurrent send versus reject commits exactly one terminal decision", async () => {
  const f = await fixture(); const runId = await generate(f);
  const results = await Promise.allSettled([
    sendCopilotResponse(f.agent.id, f.ticket.id, runId, { finalMessage: original }),
    evaluateCopilotRun(f.agent.id, f.ticket.id, runId, { disposition: "REJECTED", reason: "OTHER" })
  ]);
  expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
  expect((results.find(result => result.status === "rejected") as PromiseRejectedResult).reason.statusCode).toBe(409);
  const evaluation = await prisma.copilotEvaluation.findUniqueOrThrow({ where: { copilotRunId: runId } });
  expect(await prisma.ticketMessage.count({ where: { ticketId: f.ticket.id } })).toBe(evaluation.disposition === "REJECTED" ? 0 : 1);
});

test.each(["PROVIDER_FAILURE", "NO_PROVIDER_CONFIGURED"])("persists %s fallback separately from evidence abstention", async fallbackReason => {
  const f = await fixture();
  (generateWithProviders as jest.Mock).mockImplementation(async (prompt: string) => ({ draft: null, rawDraft: null,
    provider: "fallback", model: null, fallbackReason,
    attempts: [{ provider: "gemini", outcome: fallbackReason === "PROVIDER_FAILURE" ? "FAILED" : "SKIPPED", reason: fallbackReason }],
    requests: fallbackReason === "PROVIDER_FAILURE" ? [{ prompt }] : [] }));
  const runId = await generate(f); const run = await getCopilotRun(f.agent.id, f.ticket.id, runId);
  expect(run).toMatchObject({ status: "COMPLETED", generationPath: "LOCAL_FALLBACK", model: null, abstained: false });
  expect(run.providerMetadata).toMatchObject({ fallbackReason, providerGenerationSkipped: fallbackReason === "NO_PROVIDER_CONFIGURED" });
  expect(run.generationConfig).toMatchObject({ fallbackVersion: "support-fallback-v1", outputTokenLimit: null });
  expect(run.outputSnapshot).toMatchObject({ generatedDraft: run.suggestedReply });
});

test("evaluator deletion clears optional relation but preserves historical identity", async () => {
  const f = await fixture(); const runId = await generate(f);
  await evaluateCopilotRun(f.agent.id, f.ticket.id, runId, { disposition: "REJECTED", reason: "OTHER" });
  await prisma.user.delete({ where: { id: f.agent.id } });
  const run = await getCopilotRun(f.owner.id, f.ticket.id, runId);
  expect(run).toMatchObject({ triggeredById: null, triggeredByIdentity: f.agent.id });
  expect(run.evaluation).toMatchObject({ evaluatorId: null, evaluatorIdentity: f.agent.id });
});

test("database linkage guard rejects a decision pointing at another ticket's message", async () => {
  const f = await fixture(), other = await fixture(); const runId = await generate(f);
  const sent = await prisma.ticketMessage.create({ data: { ticketId: other.ticket.id, senderId: f.agent.id, body: original } });
  await expect(prisma.copilotEvaluation.create({ data: { copilotRunId: runId, integrityVersion: 1,
    evaluatorId: f.agent.id, evaluatorIdentity: f.agent.id, disposition: "ACCEPTED", originalReply: original,
    finalMessage: original, messageId: sent.id } })).rejects.toThrow();
  expect(await prisma.copilotEvaluation.count({ where: { copilotRunId: runId } })).toBe(0);
});
