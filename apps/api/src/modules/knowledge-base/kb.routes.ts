import { z } from "zod";
import { versionHistoryHandler, publishVersionHandler, copilotKnowledgeHandler } from "./kb.controller.js";
import { Router } from "express";
import { authenticate } from "../../common/middleware/auth.middleware.js";
import { validate } from "../../common/middleware/validate.middleware.js";
import { asyncHandler } from "../../common/utils/asyncHandler.js";
import { requireOrgRole } from "../organizations/org.rbac.js";
import { deleteDocumentHandler, getDocumentHandler, listChunksHandler, listDocumentsHandler, reprocessDocumentHandler, searchKnowledgeHandler, uploadDocumentHandler } from "./kb.controller.js";
import { documentIdParamSchema, orgIdParamSchema, searchKnowledgeSchema } from "./kb.schema.js";
import { blockDemoWrites } from "../../common/middleware/demoReadOnly.middleware.js";
import { uploadKnowledgeDocument } from "./kb.upload.js";
export const kbRoutes = Router({
    mergeParams: true
});
kbRoutes.use(authenticate);
kbRoutes.get("/operations", requireOrgRole(["OWNER", "ADMIN"]), asyncHandler(async (req, res) => { const { knowledgeOperations } = await import("./kb.operations.js"); res.json({ data: await knowledgeOperations(String(req.params.orgId)) }); }));
kbRoutes.get("/search", validate(searchKnowledgeSchema), requireOrgRole(["OWNER", "ADMIN", "AGENT"]), asyncHandler(searchKnowledgeHandler));
kbRoutes.get("/documents", validate(orgIdParamSchema), requireOrgRole(["OWNER", "ADMIN", "AGENT"]), asyncHandler(listDocumentsHandler));
kbRoutes.post("/documents", validate(orgIdParamSchema), requireOrgRole(["OWNER", "ADMIN"]), blockDemoWrites(), uploadKnowledgeDocument.single("file"), asyncHandler(uploadDocumentHandler));
kbRoutes.get("/documents/:documentId", validate(documentIdParamSchema), requireOrgRole(["OWNER", "ADMIN", "AGENT"]), asyncHandler(getDocumentHandler));
kbRoutes.get("/documents/:documentId/chunks", validate(documentIdParamSchema), requireOrgRole(["OWNER", "ADMIN", "AGENT"]), asyncHandler(listChunksHandler));
kbRoutes.post("/documents/:documentId/process", validate(documentIdParamSchema), requireOrgRole(["OWNER", "ADMIN"]), blockDemoWrites(), asyncHandler(reprocessDocumentHandler));
kbRoutes.delete("/documents/:documentId", validate(documentIdParamSchema), requireOrgRole(["OWNER", "ADMIN"]), blockDemoWrites(), asyncHandler(deleteDocumentHandler));
kbRoutes.get("/documents/:documentId/versions", requireOrgRole(["OWNER", "ADMIN", "AGENT"]), asyncHandler(versionHistoryHandler));
kbRoutes.post("/documents/:documentId/versions", requireOrgRole(["OWNER", "ADMIN"]), blockDemoWrites(), uploadKnowledgeDocument.single("file"), asyncHandler(uploadDocumentHandler));
kbRoutes.post("/documents/:documentId/versions/:versionId/process", requireOrgRole(["OWNER", "ADMIN"]), blockDemoWrites(), asyncHandler(reprocessDocumentHandler));
kbRoutes.post("/documents/:documentId/versions/:versionId/publish", requireOrgRole(["OWNER", "ADMIN"]), blockDemoWrites(), validate(z.object({ body: z.object({ expectedCurrentVersionId: z.string().min(1).nullable() }).strict() })), asyncHandler(publishVersionHandler));
kbRoutes.get("/copilot-runs/:runId/sources", requireOrgRole(["OWNER", "ADMIN", "AGENT"]), asyncHandler(copilotKnowledgeHandler));
