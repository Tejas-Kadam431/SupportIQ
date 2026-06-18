import type { Response } from "express";
import { AppError } from "../../common/errors/AppError.js";
import type { AuthenticatedRequest } from "../../common/middleware/auth.middleware.js";
import {
  createKnowledgeDocument,
  deleteKnowledgeDocument,
  getKnowledgeDocument,
  listKnowledgeChunks,
  listKnowledgeDocuments,
  reprocessKnowledgeDocument
} from "./kb.service.js";

function getUserId(req: AuthenticatedRequest) {
  if (!req.user) {
    throw new AppError("Authentication required", 401);
  }

  return req.user.id;
}

function getParam(req: AuthenticatedRequest, key: string) {
  const value = req.params[key];

  if (typeof value !== "string") {
    throw new AppError(`${key} parameter is required`, 400);
  }

  return value;
}

export async function uploadDocumentHandler(req: AuthenticatedRequest, res: Response) {
  const userId = getUserId(req);
  const orgId = getParam(req, "orgId");

  if (!req.file) {
    throw new AppError("File is required", 400);
  }

  const document = await createKnowledgeDocument(userId, orgId, {
    fileName: req.file.filename,
    originalName: req.file.originalname,
    mimeType: req.file.mimetype,
    sizeBytes: req.file.size,
    storagePath: req.file.path
  });

  return res.status(201).json({
    message: "Document uploaded and processed successfully",
    data: {
      document
    }
  });
}

export async function listDocumentsHandler(req: AuthenticatedRequest, res: Response) {
  const orgId = getParam(req, "orgId");

  const documents = await listKnowledgeDocuments(orgId);

  return res.status(200).json({
    data: {
      documents
    }
  });
}

export async function getDocumentHandler(req: AuthenticatedRequest, res: Response) {
  const orgId = getParam(req, "orgId");
  const documentId = getParam(req, "documentId");

  const document = await getKnowledgeDocument(orgId, documentId);

  return res.status(200).json({
    data: {
      document
    }
  });
}

export async function listChunksHandler(req: AuthenticatedRequest, res: Response) {
  const orgId = getParam(req, "orgId");
  const documentId = getParam(req, "documentId");

  const chunks = await listKnowledgeChunks(orgId, documentId);

  return res.status(200).json({
    data: {
      chunks
    }
  });
}

export async function reprocessDocumentHandler(req: AuthenticatedRequest, res: Response) {
  const orgId = getParam(req, "orgId");
  const documentId = getParam(req, "documentId");

  const document = await reprocessKnowledgeDocument(orgId, documentId);

  return res.status(200).json({
    message: "Document reprocessed successfully",
    data: {
      document
    }
  });
}

export async function deleteDocumentHandler(req: AuthenticatedRequest, res: Response) {
  const orgId = getParam(req, "orgId");
  const documentId = getParam(req, "documentId");

  await deleteKnowledgeDocument(orgId, documentId);

  return res.status(200).json({
    message: "Document deleted successfully"
  });
}