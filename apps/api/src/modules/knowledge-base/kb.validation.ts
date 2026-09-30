import path from "node:path";
import { extractTextFromBytes } from "./kb.text.js";
import { ingestionConfig } from "../../config/ingestion.js";
import { IngestionFailure } from "../../common/operations.js";
export async function validateKnowledgeBytes(bytes: Buffer, name: string, mime: string) {
    const extension = path.extname(name).toLowerCase();
    const permitted: Record<string, string[]> = { ".pdf": ["application/pdf"], ".txt": ["text/plain"], ".md": ["text/plain", "text/markdown"], ".markdown": ["text/plain", "text/markdown"] };
    if (!bytes.length || bytes.length > ingestionConfig.KNOWLEDGE_MAX_BYTES || !permitted[extension]?.includes(mime))
        throw new IngestionFailure("INVALID_FILE", false);
    if (extension === ".pdf") {
        if (bytes.subarray(0, 5).toString("ascii") !== "%PDF-")
            throw new IngestionFailure("INVALID_FILE", false);
    }
    else {
        try {
            const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
            if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text))
                throw new Error();
        }
        catch {
            throw new IngestionFailure("INVALID_FILE", false);
        }
    }
    let text: string;
    try {
        text = await extractTextFromBytes(bytes, name, mime);
    }
    catch {
        throw new IngestionFailure("PARSE_FAILED", false);
    }
    if (!text.trim() || text.length > 2000000)
        throw new IngestionFailure("INVALID_FILE", false);
    return text;
}
