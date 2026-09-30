// Evaluation core only. No production commands, signal ingestion, activities or message transport.
import { evaluateCopilotContext } from "../ai/ai.core.js";
import { generateWithProviders } from "../ai/ai.provider.js";
import { inputSnapshotSchema } from "../ai/ai.provenance.js";
import { retrieveScoped } from "../knowledge-base/kb.hybrid.js";
import { baselineSchema } from "./replay.schema.js";
import { compareCase } from "./replay.comparison.js";
export async function runEvaluationCase(orgId: string, row: {
    input: unknown;
    baseline: unknown;
    kind: string;
}, scope: string[], overrides: string[], config: {
    hybrid: boolean;
    generation: boolean;
}) {
    const input = inputSnapshotSchema.parse(row.input), baseline = baselineSchema.parse(row.baseline), started = Date.now();
    const result = await evaluateCopilotContext(input, { tone: input.tone }, () => retrieveScoped(orgId, input.retrievalQuery, 5, { kind: 'evaluation-snapshot', versionIds: scope }, config.hybrid), config.generation, (prompt, tone) => generateWithProviders(prompt, tone, 15000));
    const operationalError = result.kbSearch.diagnostics.status !== 'OK' || result.generation.attempts.some(a => a.outcome === 'FAILED') || (config.generation && result.evidence.generationAllowed && result.generation.provider === 'fallback');
    const candidate = { decision: result.evidence.decision, evidenceLevel: result.evidence.evidenceLevel, sources: result.sources, operationalError,
        query: result.searchQuery, diagnostics: result.kbSearch.diagnostics, suggestedReply: result.suggestedReply, prompt: result.prompt, provider: result.provider, model: result.generation.model, attempts: result.generation.attempts, requests: result.generation.requests, fallbackReason: result.generation.fallbackReason, generationEnabled: config.generation };
    return { candidate, comparison: compareCase(baseline, candidate, row.kind, overrides), durationMs: Date.now() - started };
}
