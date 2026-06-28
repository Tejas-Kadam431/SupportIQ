import { Router } from "express";
import { authenticate } from "../../common/middleware/auth.middleware.js";
import { validate } from "../../common/middleware/validate.middleware.js";
import { asyncHandler } from "../../common/utils/asyncHandler.js";
import { requireOrgRole } from "../organizations/org.rbac.js";
import {
  deleteDocumentHandler,
  getDocumentHandler,
  listChunksHandler,
  listDocumentsHandler,
  reprocessDocumentHandler,
  searchKnowledgeHandler,
  uploadDocumentHandler
} from "./kb.controller.js";
import {
  documentIdParamSchema,
  orgIdParamSchema,
  searchKnowledgeSchema
} from "./kb.schema.js";
import { blockDemoWrites } from "../../common/middleware/demoReadOnly.middleware.js";
import { uploadKnowledgeDocument } from "./kb.upload.js";


export const kbRoutes = Router({
  mergeParams: true
});

kbRoutes.use(authenticate);

kbRoutes.get(
  "/search",
  validate(searchKnowledgeSchema),
  requireOrgRole(["OWNER", "ADMIN", "AGENT"]),
  asyncHandler(searchKnowledgeHandler)
);

kbRoutes.get(
  "/documents",
  validate(orgIdParamSchema),
  requireOrgRole(["OWNER", "ADMIN", "AGENT"]),
  asyncHandler(listDocumentsHandler)
);

kbRoutes.post(
  "/documents",
  validate(orgIdParamSchema),
  requireOrgRole(["OWNER", "ADMIN"]),
  blockDemoWrites(),
  uploadKnowledgeDocument.single("file"),
  asyncHandler(uploadDocumentHandler)
);

kbRoutes.get(
  "/documents/:documentId",
  validate(documentIdParamSchema),
  requireOrgRole(["OWNER", "ADMIN", "AGENT"]),
  asyncHandler(getDocumentHandler)
);

kbRoutes.get(
  "/documents/:documentId/chunks",
  validate(documentIdParamSchema),
  requireOrgRole(["OWNER", "ADMIN", "AGENT"]),
  asyncHandler(listChunksHandler)
);

kbRoutes.post(
  "/documents/:documentId/process",
  validate(documentIdParamSchema),
  requireOrgRole(["OWNER", "ADMIN"]),
  blockDemoWrites(),
  asyncHandler(reprocessDocumentHandler)
);

kbRoutes.delete(
  "/documents/:documentId",
  validate(documentIdParamSchema),
  requireOrgRole(["OWNER", "ADMIN"]),
  blockDemoWrites(),
  asyncHandler(deleteDocumentHandler)
);