import { GoogleGenAI } from "@google/genai";
import OpenAI from "openai";
import { env } from "../../config/env.js";
import { OUTPUT_TOKEN_LIMIT } from "./ai.provenance.js";

type Attempt = {
  provider: "gemini" | "openai"; model: string; outcome: "SKIPPED" | "FAILED" | "SUCCEEDED";
  reason: string | null; durationMs: number; resolvedModel: string | null;
  usage: { inputTokens: number | null; outputTokens: number | null; totalTokens: number | null } | null;
};

export function buildSystemPrompt(toneInstruction: string) {
  return [
    "You are a careful customer support agent.", "Write helpful, accurate replies.",
    "Do not invent policies, refunds, timelines, discounts, or technical facts.",
    "Use the knowledge-base context only when relevant.",
    "If the answer is uncertain, ask for more information instead of making claims.",
    "The source labels like [S1] are internal citations for the support agent.",
    "Do not include source labels in the final customer-facing reply.", toneInstruction
  ].join(" ");
}

export async function generateWithProviders(prompt: string, toneInstruction: string, replayTimeoutMs?: number) {
  const attempts: Attempt[] = [];
  const requests: Array<{ provider: string; model: string; prompt: string; systemPrompt: string | null;
    temperature: number | null; maxOutputTokens: number }> = [];
  let draft: string | null = null;
  let rawDraft: string | null = null;
  let provider: "gemini" | "openai" | "fallback" = "fallback";
  let model: string | null = null;
  for (const selected of ["gemini", "openai"] as const) {
    const configured = selected === "gemini" ? env.GEMINI_API_KEY : env.OPENAI_API_KEY;
    const selectedModel = selected === "gemini" ? env.GEMINI_MODEL : env.OPENAI_MODEL;
    const attempt: Attempt = { provider: selected, model: selectedModel, outcome: "SKIPPED",
      reason: configured ? "PRIOR_PROVIDER_SUCCEEDED" : "NOT_CONFIGURED", durationMs: 0, usage: null, resolvedModel: null };
    attempts.push(attempt);
    if (draft || !configured) continue;
    const started = Date.now();
    const systemPrompt = selected === "openai" ? buildSystemPrompt(toneInstruction) : null;
    requests.push({ provider: selected, model: selectedModel, prompt, systemPrompt,
      temperature: selected === "openai" ? 0.25 : null, maxOutputTokens: OUTPUT_TOKEN_LIMIT });
    try {
      let text: string | undefined | null;
      if (selected === "gemini") {
        const result = await new GoogleGenAI({ apiKey: configured, ...(replayTimeoutMs ? { httpOptions: {timeout: replayTimeoutMs} } : {}) }).models.generateContent({
          model: selectedModel, contents: prompt, config: { maxOutputTokens: OUTPUT_TOKEN_LIMIT }
        });
        text = result.text;
        attempt.resolvedModel = result.modelVersion ?? null;
        attempt.usage = result.usageMetadata ? {
          inputTokens: result.usageMetadata.promptTokenCount ?? null,
          outputTokens: result.usageMetadata.candidatesTokenCount ?? null,
          totalTokens: result.usageMetadata.totalTokenCount ?? null
        } : null;
      } else {
        const result = await new OpenAI({ apiKey: configured, ...(replayTimeoutMs ? {timeout: replayTimeoutMs, maxRetries: 0} : {}) }).chat.completions.create({
          model: selectedModel, temperature: 0.25, max_completion_tokens: OUTPUT_TOKEN_LIMIT,
          messages: [{ role: "system", content: systemPrompt! }, { role: "user", content: prompt }]
        });
        text = result.choices[0]?.message?.content;
        attempt.resolvedModel = result.model ?? null;
        attempt.usage = result.usage ? { inputTokens: result.usage.prompt_tokens,
          outputTokens: result.usage.completion_tokens, totalTokens: result.usage.total_tokens } : null;
      }
      if (!text?.trim() || text.length > 32000) {
        attempt.reason = text?.trim() ? "OUTPUT_TOO_LARGE" : "EMPTY_RESPONSE";
        throw new Error("Unusable provider output");
      }
      rawDraft = text; draft = text.trim(); provider = selected; model = selectedModel;
      attempt.outcome = "SUCCEEDED"; attempt.reason = null;
    } catch {
      attempt.outcome = "FAILED";
      if (attempt.reason !== "EMPTY_RESPONSE" && attempt.reason !== "OUTPUT_TOO_LARGE") attempt.reason = "PROVIDER_ERROR";
      console.error({ event: "copilot.provider_failed", provider: selected, reason: attempt.reason });
    } finally { attempt.durationMs = Date.now() - started; }
  }
  return { draft, rawDraft, provider, model, attempts, requests,
    fallbackReason: draft ? null : attempts.some(attempt => attempt.outcome === "FAILED") ? "PROVIDER_FAILURE" : "NO_PROVIDER_CONFIGURED" };
}
