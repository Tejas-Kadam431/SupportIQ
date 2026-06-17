import fs from "fs/promises";
import path from "path";
import { createRequire } from "module";
import { prisma } from "../../config/prisma.js";
type PdfParseResult = {
  text: string;
};

type PdfParse = (buffer: Buffer) => Promise<PdfParseResult>;

const require = createRequire(import.meta.url);
const pdfParse = require("pdf-parse") as PdfParse;

const CHUNK_SIZE = 1200;
const CHUNK_OVERLAP = 200;

function normalizeText(text: string) {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\t/g, " ")
    .replace(/[ ]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function estimateTokenCount(text: string) {
  return Math.ceil(text.split(/\s+/).filter(Boolean).length * 1.3);
}

function chunkText(text: string) {
  const normalized = normalizeText(text);

  if (!normalized) {
    return [];
  }

  const chunks: string[] = [];
  let start = 0;

  while (start < normalized.length) {
    const end = Math.min(start + CHUNK_SIZE, normalized.length);
    const chunk = normalized.slice(start, end).trim();

    if (chunk) {
      chunks.push(chunk);
    }

    if (end >= normalized.length) {
      break;
    }

    start = Math.max(end - CHUNK_OVERLAP, start + 1);
  }

  return chunks;
}

async function extractTextFromFile(storagePath: string, mimeType: string, originalName: string) {
  const extension = path.extname(originalName).toLowerCase();
  const fileBuffer = await fs.readFile(storagePath);

  if (mimeType === "application/pdf" || extension === ".pdf") {
    const parsedPdf = await pdfParse(fileBuffer);
    return parsedPdf.text;
  }

  if (
    mimeType === "text/plain" ||
    mimeType === "text/markdown" ||
    extension === ".txt" ||
    extension === ".md" ||
    extension === ".markdown"
  ) {
    return fileBuffer.toString("utf-8");
  }

  throw new Error("Unsupported file type");
}

export async function processKnowledgeDocument(documentId: string) {
  const document = await prisma.knowledgeDocument.findUnique({
    where: {
      id: documentId
    }
  });

  if (!document) {
    throw new Error("Knowledge document not found");
  }

  await prisma.knowledgeDocument.update({
    where: {
      id: document.id
    },
    data: {
      status: "PROCESSING",
      errorMessage: null
    }
  });

  try {
    const rawText = await extractTextFromFile(
      document.storagePath,
      document.mimeType,
      document.originalName
    );

    const chunks = chunkText(rawText);

    if (chunks.length === 0) {
      throw new Error("No extractable text found in document");
    }

    await prisma.$transaction(async (tx) => {
      await tx.knowledgeChunk.deleteMany({
        where: {
          documentId: document.id
        }
      });

      await tx.knowledgeChunk.createMany({
        data: chunks.map((chunk, index) => ({
          documentId: document.id,
          organizationId: document.organizationId,
          content: chunk,
          chunkIndex: index,
          tokenCount: estimateTokenCount(chunk)
        }))
      });

      await tx.knowledgeDocument.update({
        where: {
          id: document.id
        },
        data: {
          status: "READY",
          errorMessage: null
        }
      });
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to process document";

    await prisma.knowledgeDocument.update({
      where: {
        id: document.id
      },
      data: {
        status: "FAILED",
        errorMessage: message
      }
    });

    throw error;
  }
}