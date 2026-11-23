import OpenAI from "openai";
import { env } from "../../config/env.js";
import type { SearchStatus } from "./kb.retrieval.js";
export const EMBEDDING_DIMENSIONS = 1536;
export function embeddingConfigured() {
    return Boolean(env.EMBEDDING_PROVIDER === "gemini" ? env.GEMINI_API_KEY : env.OPENAI_API_KEY);
}
// Keep existing OpenAI identities unchanged. Provider/dimension qualification prevents mixing spaces.
export function embeddingModelIdentity() {
    return env.EMBEDDING_PROVIDER === "gemini" ? "gemini/" + env.GEMINI_EMBEDDING_MODEL + "/1536" : env.OPENAI_EMBEDDING_MODEL;
}
export async function createTextEmbedding(text: string, purpose: "document" | "query" = "document"): Promise<{ embedding: number[] | null; status: SearchStatus }> {
    if (!embeddingConfigured()) return { embedding: null, status: "NOT_CONFIGURED" };
    try {
        let values: number[] | undefined;
        if (env.EMBEDDING_PROVIDER === "gemini") {
            const response = await fetch("https://generativelanguage.googleapis.com/v1beta/models/" + env.GEMINI_EMBEDDING_MODEL + ":embedContent", {
                method: "POST", redirect: "error", signal: AbortSignal.timeout(10000),
                headers: { "Content-Type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY! },
                body: JSON.stringify({ model: "models/" + env.GEMINI_EMBEDDING_MODEL, content: { parts: [{ text: text.slice(0, 8000) }] }, taskType: purpose === "query" ? "RETRIEVAL_QUERY" : "RETRIEVAL_DOCUMENT", outputDimensionality: EMBEDDING_DIMENSIONS })
            });
            if (!response.ok) throw new Error("Embedding provider failed");
            values = ((await response.json()) as { embedding?: { values?: number[] } }).embedding?.values;
        } else {
            const response = await new OpenAI({ apiKey: env.OPENAI_API_KEY, timeout: 10000, maxRetries: 0 }).embeddings.create({ model: env.OPENAI_EMBEDDING_MODEL, input: text.slice(0, 8000), dimensions: EMBEDDING_DIMENSIONS });
            values = response.data[0]?.embedding;
        }
        if (!Array.isArray(values) || values.length !== EMBEDDING_DIMENSIONS || !values.every(Number.isFinite) || !values.some(v => v !== 0)) throw new Error("Invalid embedding");
        if (env.EMBEDDING_PROVIDER === "gemini") {
            const norm = Math.hypot(...values);
            if (!Number.isFinite(norm) || norm === 0) throw new Error("Invalid embedding norm");
            values = values.map(v => v / norm);
        }
        return { embedding: values, status: "OK" };
    } catch {
        console.warn({ event: "retrieval.embedding_failed" });
        return { embedding: null, status: "EMBEDDING_FAILED" };
    }
}
