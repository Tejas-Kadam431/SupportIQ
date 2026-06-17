import fs from "fs/promises";
import { prisma } from "../../config/prisma.js";
import { AppError } from "../../common/errors/AppError.js";

type UploadedFileInput = {
  fileName: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  storagePath: string;
};

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
    },
    include: {
      uploadedBy: {
        select: {
          id: true,
          name: true,
          email: true,
          avatarUrl: true
        }
      }
    }
  });

  return document;
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
      }
    }
  });

  if (!document || document.organizationId !== orgId) {
    throw new AppError("Document not found", 404);
  }

  return document;
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