import { getVersionHistory, publishKnowledgeVersion } from "./kb.version.service.js";
import { resolveCopilotKnowledge } from "./kb.provenance.js";
import type { Request, Response } from "express";
import { AppError } from "../../common/errors/AppError.js";
import type { AuthenticatedRequest } from "../../common/middleware/auth.middleware.js";
import { createKnowledgeDocument, deleteKnowledgeDocument, getKnowledgeDocument, listKnowledgeChunks, listKnowledgeDocuments, reprocessKnowledgeDocument, searchKnowledgeBase } from "./kb.service.js";
import type { SearchKnowledgeQuery } from "./kb.schema.js";
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
        fileName: "upload",
        originalName: req.file.originalname,
        mimeType: req.file.mimetype,
        sizeBytes: req.file.size,
        bytes: req.file.buffer,
        requestId: res.locals.requestId
    }, typeof req.params.documentId === "string" ? req.params.documentId : undefined);
    return res.status(201).json({
        message: "Version uploaded. Processing is queued; publish it when ready.",
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
export async function searchKnowledgeHandler(req: AuthenticatedRequest, res: Response) {
    const orgId = getParam(req, "orgId");
    const result = await searchKnowledgeBase(orgId, req.query as unknown as SearchKnowledgeQuery);
    return res.status(200).json({
        data: result
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
    const userId = getUserId(req);
    const orgId = getParam(req, "orgId");
    const documentId = getParam(req, "documentId");
    const document = await reprocessKnowledgeDocument(orgId, documentId, userId, typeof req.params.versionId === "string" ? req.params.versionId : undefined);
    return res.status(200).json({
        data: {
            document
        }
    });
}
export async function deleteDocumentHandler(req: AuthenticatedRequest, res: Response) {
    const orgId = getParam(req, "orgId");
    const documentId = getParam(req, "documentId");
    await deleteKnowledgeDocument(orgId, documentId, getUserId(req));
    return res.status(200).json({
        message: "Document archived. Historical versions retained."
    });
}
export async function versionHistoryHandler(req: AuthenticatedRequest, res: Response) { return res.json({ data: { document: await getVersionHistory(getUserId(req), getParam(req, "orgId"), getParam(req, "documentId")) } }); }
export async function publishVersionHandler(req: AuthenticatedRequest, res: Response) { return res.json({ data: { version: await publishKnowledgeVersion(getUserId(req), getParam(req, "orgId"), getParam(req, "documentId"), getParam(req, "versionId"), req.body.expectedCurrentVersionId) } }); }
export async function copilotKnowledgeHandler(req: AuthenticatedRequest, res: Response) { return res.json({ data: await resolveCopilotKnowledge(getUserId(req), getParam(req, "orgId"), getParam(req, "runId")) }); }
