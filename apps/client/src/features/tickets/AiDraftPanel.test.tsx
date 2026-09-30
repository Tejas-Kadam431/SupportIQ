// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { beforeEach, afterEach, expect, test, vi } from "vitest";
import { AiDraftPanel } from "./AiDraftPanel";
const { generate, send, reject } = vi.hoisted(() => ({ generate: vi.fn(), send: vi.fn(), reject: vi.fn() }));
vi.mock("./aiApi", () => ({
  useGenerateAiDraftMutation: () => [generate, { isLoading: false }],
  useSendCopilotMutation: () => [send, { isLoading: false }],
  useEvaluateCopilotMutation: () => [reject, { isLoading: false }]
}));
const result = { runId: "run-1", suggestedReply: "Original reply", issueSummary: "Password reset",
  topic: "Password", missingInformation: [], recommendedAction: "Review", abstained: false,
  provider: "gemini", confidence: "MEDIUM", warnings: [], sources: [],
  grounding: { searchQuery: "password", searchMode: "keyword", sourceCount: 1, hasKnowledgeContext: true } };
beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(window, "confirm").mockReturnValue(true);
  generate.mockReturnValue({ unwrap: async () => ({ data: result }) });
  send.mockReturnValue({ unwrap: async () => ({ data: { evaluation: { disposition: "EDITED" }, replayed: false } }) });
  reject.mockReturnValue({ unwrap: async () => ({}) });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
async function run() {
  render(<AiDraftPanel ticketId="ticket-1" />);
  fireEvent.click(screen.getByRole("button", { name: "Run AI Copilot" }));
  await screen.findByLabelText("Suggested customer reply");
}
test("one send command records server classification without a second evaluation request", async () => {
  await run(); fireEvent.click(screen.getByRole("button", { name: "Send as message" }));
  await screen.findByText("Edited Copilot response recorded for AI quality analysis.");
  expect(send).toHaveBeenCalledWith({ ticketId: "ticket-1", runId: "run-1", finalMessage: "Original reply" });
  expect(reject).not.toHaveBeenCalled();
  expect((screen.getByRole("button", { name: "Send as message" }) as HTMLButtonElement).disabled).toBe(true);
});
test("uncertain network response can retry the same run/text safely", async () => {
  send.mockReturnValueOnce({ unwrap: async () => { throw { status: "FETCH_ERROR" }; } });
  await run(); fireEvent.click(screen.getByRole("button", { name: "Send as message" }));
  await screen.findByText("Send could not be confirmed. Retry the same reply to check safely.");
  fireEvent.click(screen.getByRole("button", { name: "Send as message" }));
  await screen.findByText("Reply sent as a public message.");
  expect(send).toHaveBeenCalledTimes(2); expect(send.mock.calls[0]).toEqual(send.mock.calls[1]);
});
test("immediate double-click cannot dispatch duplicate commands", async () => {
  let resolve!: (result: unknown) => void;
  send.mockReturnValue({ unwrap: () => new Promise(r => { resolve = r; }) });
  await run(); const button = screen.getByRole("button", { name: "Send as message" });
  fireEvent.click(button); fireEvent.click(button); expect(send).toHaveBeenCalledTimes(1);
  resolve({ data: { evaluation: { disposition: "ACCEPTED" } } });
  await screen.findByText("Copilot suggestion accepted. Feedback recorded.");
});
test("conflict disables the old run and regeneration enables a new decision", async () => {
  send.mockReturnValueOnce({ unwrap: async () => { throw { status: 409, data: { message: "Ticket context changed" } }; } });
  await run(); fireEvent.click(screen.getByRole("button", { name: "Send as message" }));
  await screen.findByText("Ticket context changed");
  expect((screen.getByRole("button", { name: "Send as message" }) as HTMLButtonElement).disabled).toBe(true);
  generate.mockReturnValue({ unwrap: async () => ({ data: { ...result, runId: "run-2" } }) });
  fireEvent.click(screen.getByRole("button", { name: "Run AI Copilot" }));
  await waitFor(() => expect((screen.getByRole("button", { name: "Send as message" }) as HTMLButtonElement).disabled).toBe(false));
});
test("rejection is separate and terminal", async () => {
  await run(); fireEvent.click(screen.getByRole("button", { name: "Reject Copilot suggestion" }));
  await waitFor(() => expect(reject).toHaveBeenCalledWith({ ticketId: "ticket-1", runId: "run-1", disposition: "REJECTED", reason: "INSUFFICIENT_KB" }));
  expect(send).not.toHaveBeenCalled();
  await waitFor(() => expect((screen.getByRole("button", { name: "Send as message" }) as HTMLButtonElement).disabled).toBe(true));
});
test("ephemeral demo result cannot use the send mutation", async () => {
  generate.mockReturnValue({ unwrap: async () => ({ data: { ...result, runId: null } }) });
  await run(); expect((screen.getByRole("button", { name: "Send as message" }) as HTMLButtonElement).disabled).toBe(true);
  expect(send).not.toHaveBeenCalled();
});
test("changing ticket discards the old ticket's run", async () => {
  const view = render(<AiDraftPanel ticketId="ticket-1" />);
  fireEvent.click(screen.getByRole("button", { name: "Run AI Copilot" })); await screen.findByLabelText("Suggested customer reply");
  view.rerender(<AiDraftPanel ticketId="ticket-2" />);
  expect(screen.queryByRole("button", { name: "Send as message" })).toBeNull();
});

test("evidence strength replaces confidence and abstention shows the actual reason", async () => {
 generate.mockReturnValue({unwrap:async()=>({data:{...result,confidence:"LOW",abstained:true,suggestedReply:null,recommendedAction:"Knowledge retrieval temporarily unavailable"}})});
 render(<AiDraftPanel ticketId="ticket-1" />);fireEvent.click(screen.getByRole("button",{name:"Run AI Copilot"}));
 await screen.findByText("Evidence: Insufficient");expect(screen.getAllByText("Knowledge retrieval temporarily unavailable").length).toBeGreaterThan(0);
 expect(screen.queryByText(/LOW confidence/)).toBeNull();expect(screen.queryByRole("button",{name:"Send as message"})).toBeNull();
});
