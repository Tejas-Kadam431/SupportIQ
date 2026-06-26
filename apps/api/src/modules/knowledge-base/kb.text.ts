import fs from "fs/promises";
import { AppError } from "../../common/errors/AppError.js";
import { createRequire } from "node:module";
import path from "node:path";

const nodeRequire = createRequire(path.join(process.cwd(), "package.json"));

type PdfParseResult = {
  text: string;
};

const pdfParse = nodeRequire("pdf-parse") as (
  buffer: Buffer
) => Promise<PdfParseResult>;

export async function extractTextFromFile(filePath: string, mimeType: string) {
  const extension = path.extname(filePath).toLowerCase();

  if (mimeType === "application/pdf" || extension === ".pdf") {
    const buffer = await fs.readFile(filePath);
    const result = await pdfParse(buffer);

    return cleanExtractedText(result.text);
  }

  if (
    mimeType === "text/plain" ||
    mimeType === "text/markdown" ||
    extension === ".txt" ||
    extension === ".md" ||
    extension === ".markdown"
  ) {
    const content = await fs.readFile(filePath, "utf8");

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