jest.mock("../modules/knowledge-base/kb.scope.js",()=>({currentKnowledgeScope:async()=>({kind:"current-publication-snapshot",versionIds:["v"]})}));
import { retrieveHybrid } from "../modules/knowledge-base/kb.hybrid.js";
import { searchLexical } from "../modules/knowledge-base/kb.lexical.js";
import { searchKnowledgeChunksByVector } from "../modules/knowledge-base/kb.vector.js";
import { row } from "./fixtures/evidence.fixtures.js";
jest.mock("../modules/knowledge-base/kb.lexical.js", () => ({ searchLexical: jest.fn() }));
jest.mock("../modules/knowledge-base/kb.vector.js", () => ({ searchKnowledgeChunksByVector: jest.fn() }));
beforeEach(() => { jest.clearAllMocks(); });
test("lexical failure preserves semantic candidates", async () => {
    (searchKnowledgeChunksByVector as jest.Mock).mockResolvedValue({ status: "OK", results: [row("a")], missingEmbeddings: 0 });
    (searchLexical as jest.Mock).mockRejectedValue(new Error("sensitive SQL"));
    const result = await retrieveHybrid("tenant", "query");
    expect(result.diagnostics).toMatchObject({ semanticStatus: "OK", lexicalStatus: "LEXICAL_FAILED" });
    expect(result.results[0].matchedBy).toEqual(["semantic"]);
    expect(searchKnowledgeChunksByVector).toHaveBeenCalledWith("tenant", "query", 20,expect.objectContaining({versionIds:["v"]}));
    expect(searchLexical).toHaveBeenCalledWith("tenant", "query", 20,expect.objectContaining({versionIds:["v"]}));
});
test("both failures remain operational rather than empty healthy results", async () => {
    (searchKnowledgeChunksByVector as jest.Mock).mockRejectedValue(new Error("database"));
    (searchLexical as jest.Mock).mockRejectedValue(new Error("database"));
    const result = await retrieveHybrid("tenant", "query");
    expect(result.diagnostics).toMatchObject({ status: "DEGRADED", semanticStatus: "VECTOR_FAILED", lexicalStatus: "LEXICAL_FAILED" });
});
test("healthy misses remain healthy", async () => {
    (searchKnowledgeChunksByVector as jest.Mock).mockResolvedValue({ status: "OK", results: [], missingEmbeddings: 0 });
    (searchLexical as jest.Mock).mockResolvedValue([]);
    expect((await retrieveHybrid("tenant", "query")).diagnostics.status).toBe("OK");
});
