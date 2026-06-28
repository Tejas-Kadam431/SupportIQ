import { prisma } from "../../config/prisma.js";
import { AppError } from "../../common/errors/AppError.js";
import { chunkText } from "./kb.chunker.js";
import { extractTextFromFile } from "./kb.text.js";
import { saveKnowledgeChunkEmbedding } from "./kb.vector.js";

export async function processKnowledgeDocument(orgId: string, documentId: string) {
  const document = await prisma.knowledgeDocument.findUnique({
    where: {
      id: documentId
    }
  });

  if (!document || document.organizationId !== orgId) {
    throw new AppError("Document not found", 404);
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
    const text = await extractTextFromFile(document.storagePath, document.mimeType);
    const chunks = chunkText(text);

    if (chunks.length === 0) {
      throw new AppError("No readable text found in document", 400);
    }

    const createdChunks = await prisma.$transaction(async (tx) => {
      await tx.knowledgeChunk.deleteMany({
        where: {
          documentId: document.id
        }
      });

      const rows = [];

      for (const chunk of chunks) {
        const createdChunk = await tx.knowledgeChunk.create({
          data: {
            organizationId: orgId,
            documentId: document.id,
            chunkIndex: chunk.chunkIndex,
            content: chunk.content,
            tokenCount: chunk.tokenCount
          }
        });

        rows.push(createdChunk);
      }

      return rows;
    });

    let embeddedChunkCount = 0;

    for (const chunk of createdChunks) {
      const saved = await saveKnowledgeChunkEmbedding(chunk.id, chunk.content);

      if (saved) {
        embeddedChunkCount += 1;
      }
    }

    await prisma.knowledgeDocument.update({
      where: {
        id: document.id
      },
      data: {
        status: "READY",
        errorMessage: null
      }
    });

    return {
      documentId: document.id,
      status: "READY" as const,
      chunkCount: chunks.length,
      embeddedChunkCount
    };
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