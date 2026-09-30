import { randomUUID } from "node:crypto";
import type { RequestHandler } from "express";
const safeFields = new Set(["requestId", "organizationId", "userId", "ticketId", "knowledgeDocumentId", "knowledgeVersionId", "jobId", "outboxEventId", "copilotRunId", "evaluationExperimentId", "category", "stage", "attempt", "durationMs", "status", "count"]);
export function redact(context: Record<string, unknown>) {
    return Object.fromEntries(Object.entries(context).map(([key, value]) => [key, safeFields.has(key) && (typeof value === "number" || typeof value === "boolean" || (typeof value === "string" && /^[a-zA-Z0-9_.-]{1,160}$/.test(value))) ? value : "[REDACTED]"]));
}
export function log(event: string, context: Record<string, unknown> = {}) {
    console.log(JSON.stringify({ time: new Date().toISOString(), event: /^[a-z_.]{1,80}$/.test(event) ? event : "operation", ...redact(context) }));
}
export const counters: Record<string, number> = Object.create(null);
export function metric(name: "http_count" | "http_error" | "http_duration_ms" | "storage_upload_failure" | "storage_read_failure" | "processing_success" | "processing_failure" | "processing_duration_ms" | "stale_recovery", value = 1) { counters[name] = (counters[name] ?? 0) + value; }
export function requestId(value: unknown) { return typeof value === "string" && /^[a-zA-Z0-9_-]{8,80}$/.test(value) ? value : randomUUID(); }
export const requestContext: RequestHandler = (req, res, next) => {
    const id = requestId(req.get("x-request-id"));
    res.locals.requestId = id;
    res.setHeader("x-request-id", id);
    const started = performance.now();
    res.once("finish", () => { const durationMs = Math.round(performance.now() - started); metric("http_count"); metric("http_duration_ms", durationMs); if (res.statusCode >= 400)
        metric("http_error"); log("http.completed", { requestId: id, status: res.statusCode, durationMs }); });
    next();
};
export type FailureCategory = "STORAGE_UNAVAILABLE" | "SOURCE_MISSING" | "SOURCE_CHANGED" | "INVALID_FILE" | "PARSE_FAILED" | "EMBEDDING_PROVIDER_FAILED" | "QUEUE_UNAVAILABLE" | "PROCESSING_STALE" | "DATABASE_ERROR" | "INDEX_INCOMPLETE";
export class IngestionFailure extends Error {
    constructor(public category: FailureCategory, public retryable: boolean) { super(category); }
}
export function classify(error: unknown): IngestionFailure { return error instanceof IngestionFailure ? error : new IngestionFailure("DATABASE_ERROR", true); }
