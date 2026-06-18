import fs from "fs/promises";
import { prisma } from "../../config/prisma.js";
import { AppError } from "../../common/errors/AppError.js";
import { processKnowledgeDocument } from "./kb.processing.js";
import type { SearchKnowledgeQuery } from "./kb.schema.js";

type UploadedFileInput = {
  fileName: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  storagePath: string;
};

function parsePositiveInt(value: string | undefined, fallback: number) {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
}

function normalizeSearchQuery(query: string) {
  return query.trim().replace(/\s+/g, " ");
}

function scoreChunk(content: string, query: string) {
  const normalizedContent = content.toLowerCase();
  const normalizedQuery = query.toLowerCase();

  const terms = normalizedQuery
    .split(" ")
    .map((term) => term.trim())
    .filter(Boolean);

  let score = 0;

  if (normalizedContent.includes(normalizedQuery)) {
    score += 10;
  }

  for (const term of terms) {
    const matches = normalizedContent.match(new RegExp(escapeRegExp(term), "g"));
    score += matches ? matches.length : 0;
  }

  return score;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function createKnowledgeDocument(
  userId: string,
  orgId: string,
  input: UploadedFileInput
) {
  const document = await prisma.knowledgeDocument.create({
    data: {
      organizationId: orgId,
      uploadedById: userId,
      fileName: input.fileName,
      originalName: input.originalName,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
      storagePath: input.storagePath,
      status: "UPLOADED"
    }
  });

  await processKnowledgeDocument(orgId, document.id);

  return getKnowledgeDocument(orgId, document.id);
}

export async function listKnowledgeDocuments(orgId: string) {
  return prisma.knowledgeDocument.findMany({
    where: {
      organizationId: orgId
    },
    include: {
      uploadedBy: {
        select: {
          id: true,
          name: true,
          email: true,
          avatarUrl: true
        }
      },
      _count: {
        select: {
          chunks: true
        }
      }
    },
    orderBy: {
      createdAt: "desc"
    }
  });
}

export async function getKnowledgeDocument(orgId: string, documentId: string) {
  const document = await prisma.knowledgeDocument.findUnique({
    where: {
      id: documentId
    },
    include: {
      uploadedBy: {
        select: {
          id: true,
          name: true,
          email: true,
          avatarUrl: true
        }
      },
      _count: {
        select: {
          chunks: true
        }
      }
    }
  });

  if (!document || document.organizationId !== orgId) {
    throw new AppError("Document not found", 404);
  }

  return document;
}

export async function listKnowledgeChunks(orgId: string, documentId: string) {
  await getKnowledgeDocument(orgId, documentId);

  return prisma.knowledgeChunk.findMany({
    where: {
      organizationId: orgId,
      documentId
    },
    orderBy: {
      chunkIndex: "asc"
    }
  });
}

export async function searchKnowledgeBase(orgId: string, query: SearchKnowledgeQuery) {
  const searchQuery = normalizeSearchQuery(query.q);
  const limit = Math.min(parsePositiveInt(query.limit, 10), 25);

  if (!searchQuery) {
    throw new AppError("Search query is required", 400);
  }

  const terms = searchQuery
    .split(" ")
    .map((term) => term.trim())
    .filter(Boolean);

  const chunks = await prisma.knowledgeChunk.findMany({
    where: {
      organizationId: orgId,
      document: {
        status: "READY"
      },
      OR: [
        {
          content: {
            contains: searchQuery,
            mode: "insensitive"
          }
        },
        ...terms.map((term) => ({
          content: {
            contains: term,
            mode: "insensitive" as const
          }
        }))
      ]
    },
    include: {
      document: {
        select: {
          id: true,
          originalName: true,
          fileName: true,
          mimeType: true,
          status: true,
          createdAt: true
        }
      }
    },
    take: limit * 3,
    orderBy: {
      createdAt: "desc"
    }
  });

  const results = chunks
    .map((chunk) => ({
      id: chunk.id,
      organizationId: chunk.organizationId,
      documentId: chunk.documentId,
      chunkIndex: chunk.chunkIndex,
      content: chunk.content,
      tokenCount: chunk.tokenCount,
      createdAt: chunk.createdAt,
      document: chunk.document,
      score: scoreChunk(chunk.content, searchQuery)
    }))
    .filter((chunk) => chunk.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return {
    query: searchQuery,
    results,
    total: results.length
  };
}

export async function reprocessKnowledgeDocument(orgId: string, documentId: string) {
  await getKnowledgeDocument(orgId, documentId);

  await processKnowledgeDocument(orgId, documentId);

  return getKnowledgeDocument(orgId, documentId);
}

export async function deleteKnowledgeDocument(orgId: string, documentId: string) {
  const document = await getKnowledgeDocument(orgId, documentId);

  await prisma.knowledgeDocument.delete({
    where: {
      id: document.id
    }
  });

  try {
    await fs.unlink(document.storagePath);
  } catch {
    // File may already be missing locally. DB deletion should still succeed.
  }
}