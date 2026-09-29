import fs from "fs/promises";
import { AppError } from "../../common/errors/AppError.js";
import { createRequire } from "node:module";
import path from "node:path";

const nodeRequire = createRequire(path.join(process.cwd(), "package.json"));


export async function extractTextFromFile(filePath: string, mimeType: string) {
  return extractTextFromBytes(await fs.readFile(filePath), filePath, mimeType);
}

export async function extractTextFromBytes(buffer: Buffer, filePath: string, mimeType: string) {
  const extension = path.extname(filePath).toLowerCase();

  if (mimeType === "application/pdf" || extension === ".pdf") {
    const { PDFParse } = nodeRequire("pdf-parse") as typeof import("pdf-parse");
    const parser = new PDFParse({ data: buffer });
    try { return cleanExtractedText((await parser.getText()).text); } finally { await parser.destroy(); }
  }

  if (
    mimeType === "text/plain" ||
    mimeType === "text/markdown" ||
    extension === ".txt" ||
    extension === ".md" ||
    extension === ".markdown"
  ) {
    const content = buffer.toString("utf8");

    return cleanExtractedText(content);
  }

  throw new AppError("Unsupported document type", 400);
}

function cleanExtractedText(text: string) {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\t/g, " ")
    .replace(/[ ]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}