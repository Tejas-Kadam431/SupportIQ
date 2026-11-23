import OpenAI from "openai";
import { env } from "../config/env.js";
import { createTextEmbedding, embeddingConfigured, embeddingModelIdentity } from "../modules/knowledge-base/kb.embedding.js";
jest.mock("openai", () => ({ __esModule: true, default: jest.fn() }));
jest.mock("../config/env.js", () => ({ env: { EMBEDDING_PROVIDER: "openai", OPENAI_EMBEDDING_MODEL: "text-embedding-3-small", GEMINI_EMBEDDING_MODEL: "gemini-embedding-001" } }));
const embed = jest.fn();
let request: jest.SpyInstance, warning: jest.SpyInstance;
beforeEach(() => {
    jest.resetAllMocks(); env.EMBEDDING_PROVIDER="openai"; env.OPENAI_API_KEY=undefined; env.GEMINI_API_KEY=undefined;
    (OpenAI as unknown as jest.Mock).mockImplementation(() => ({ embeddings: { create: embed } }));
    request=jest.spyOn(globalThis,"fetch"); warning=jest.spyOn(console,"warn").mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());
const vector=()=>Array.from({length:1536},(_,i)=>i===0?3:i===1?4:0);
test("default OpenAI identity and dimensionality remain compatible",async()=>{
    env.OPENAI_API_KEY="mock-only"; embed.mockResolvedValue({data:[{embedding:vector()}]});
    expect(embeddingModelIdentity()).toBe("text-embedding-3-small");
    expect((await createTextEmbedding("document")).status).toBe("OK");
    expect(embed).toHaveBeenCalledWith({model:"text-embedding-3-small",input:"document",dimensions:1536});
    expect(request).not.toHaveBeenCalled();
});
test("Gemini uses a distinct space, document/query tasks, bounded TLS request and normalized 1536 dimensions",async()=>{
    env.EMBEDDING_PROVIDER="gemini";env.GEMINI_API_KEY="mock-only";
    request.mockResolvedValue({ok:true,json:async()=>({embedding:{values:vector()}})} as Response);
    expect(embeddingModelIdentity()).toBe("gemini/gemini-embedding-001/1536");
    const result=await createTextEmbedding("a".repeat(9000));
    expect(result.embedding?.slice(0,2)).toEqual([0.6,0.8]);
    const [url,options]=request.mock.calls[0]!;
    expect(url).toBe("https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent");
    expect(options.redirect).toBe("error");expect(options.signal).toBeInstanceOf(AbortSignal);
    const body=JSON.parse(options.body);expect(body.outputDimensionality).toBe(1536);expect(body.taskType).toBe("RETRIEVAL_DOCUMENT");expect(body.content.parts[0].text).toHaveLength(8000);
    await createTextEmbedding("question","query");expect(JSON.parse(request.mock.calls[1]![1].body).taskType).toBe("RETRIEVAL_QUERY");
});
test("missing selected-provider key makes no request or paid-provider fallback",async()=>{
    env.EMBEDDING_PROVIDER="gemini";env.OPENAI_API_KEY="unused";
    expect(embeddingConfigured()).toBe(false);expect(await createTextEmbedding("x")).toEqual({embedding:null,status:"NOT_CONFIGURED"});
    expect(request).not.toHaveBeenCalled();expect(embed).not.toHaveBeenCalled();
});
test.each([[],Array(1536).fill(0),Array(1535).fill(1),[NaN,...Array(1535).fill(1)]].map(values=>[values]))("rejects invalid provider vectors",async values=>{
    env.EMBEDDING_PROVIDER="gemini";env.GEMINI_API_KEY="mock-only";
    request.mockResolvedValue({ok:true,json:async()=>({embedding:{values}})} as Response);
    expect((await createTextEmbedding("x")).status).toBe("EMBEDDING_FAILED");
});
test("HTTP quota refusal and timeout fail safely without leaking provider content",async()=>{
    env.EMBEDDING_PROVIDER="gemini";env.GEMINI_API_KEY="mock-only";
    request.mockResolvedValueOnce({ok:false,status:429} as Response).mockRejectedValueOnce(new Error("secret provider body"));
    expect((await createTextEmbedding("private document")).status).toBe("EMBEDDING_FAILED");
    expect((await createTextEmbedding("private document")).status).toBe("EMBEDDING_FAILED");
    expect(warning.mock.calls).toEqual([[{event:"retrieval.embedding_failed"}],[{event:"retrieval.embedding_failed"}]]);
    expect(embed).not.toHaveBeenCalled();
});
