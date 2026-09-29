import { GoogleGenAI } from "@google/genai";
import OpenAI from "openai";
import { env } from "../config/env.js";
import { generateWithProviders } from "../modules/ai/ai.provider.js";
jest.mock("@google/genai", () => ({ GoogleGenAI: jest.fn() }));
jest.mock("openai", () => ({ __esModule: true, default: jest.fn() }));
jest.mock("../config/env.js", () => ({ env: { GEMINI_API_KEY: "test", OPENAI_API_KEY: "test", GEMINI_MODEL: "gemini-test", OPENAI_MODEL: "openai-test" } }));
const gemini = jest.fn(), openai = jest.fn();
let log: jest.SpyInstance;
beforeEach(() => {
  jest.resetAllMocks(); env.GEMINI_API_KEY = "test"; env.OPENAI_API_KEY = "test";
  (GoogleGenAI as jest.Mock).mockImplementation(() => ({ models: { generateContent: gemini } }));
  (OpenAI as unknown as jest.Mock).mockImplementation(() => ({ chat: { completions: { create: openai } } }));
  log = jest.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => log.mockRestore());
test("records exact request, requested/resolved model, real usage and untrimmed output", async () => {
  gemini.mockResolvedValue({ text: " Reply \n", modelVersion: "gemini-build-123", usageMetadata: { promptTokenCount: 9, candidatesTokenCount: 3, totalTokenCount: 12 } });
  const result = await generateWithProviders("Rendered prompt", "Be friendly");
  expect(result).toMatchObject({ draft: "Reply", rawDraft: " Reply \n", provider: "gemini", model: "gemini-test" });
  expect(result.attempts[0]).toMatchObject({ outcome: "SUCCEEDED", resolvedModel: "gemini-build-123", usage: { inputTokens: 9, outputTokens: 3, totalTokens: 12 } });
  expect(result.requests[0]).toMatchObject({ prompt: "Rendered prompt", temperature: null, maxOutputTokens: 2048 });
  expect(gemini).toHaveBeenCalledWith({ model: "gemini-test", contents: "Rendered prompt", config: { maxOutputTokens: 2048 } });
  expect(openai).not.toHaveBeenCalled();
});
test("Gemini failure followed by OpenAI success retains the failure trace and both prompts", async () => {
  gemini.mockRejectedValue(new Error("secret prompt/API key"));
  openai.mockResolvedValue({ choices: [{ message: { content: "Reply" } }], model: "openai-resolved" });
  const result = await generateWithProviders("Private prompt", "Friendly");
  expect(result.attempts.map(a => a.outcome)).toEqual(["FAILED", "SUCCEEDED"]);
  expect(result.attempts[1].usage).toBeNull(); expect(result.requests).toHaveLength(2);
  expect(result.requests[1].systemPrompt).toContain("Friendly");
  expect(JSON.stringify(log.mock.calls)).not.toMatch(/Private prompt|secret prompt|API key/);
});
test.each(["failed", "unconfigured", "empty", "oversized"])("distinguishes %s path from evidence abstention", async kind => {
  if (kind === "unconfigured") { env.GEMINI_API_KEY = undefined; env.OPENAI_API_KEY = undefined; }
  else {
    if (kind === "failed") gemini.mockRejectedValue(new Error("private"));
    else gemini.mockResolvedValue({ text: kind === "empty" ? " " : "x".repeat(32001) });
    openai.mockRejectedValue(new Error("private"));
  }
  const result = await generateWithProviders("Prompt", "Tone");
  expect(result.provider).toBe("fallback"); expect(result.model).toBeNull(); expect(result.draft).toBeNull();
  expect(result.fallbackReason).toBe(kind === "unconfigured" ? "NO_PROVIDER_CONFIGURED" : "PROVIDER_FAILURE");
  if (kind === "empty") expect(result.attempts[0].reason).toBe("EMPTY_RESPONSE");
  if (kind === "oversized") expect(result.attempts[0].reason).toBe("OUTPUT_TOO_LARGE");
});
