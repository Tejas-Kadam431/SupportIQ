import { Router } from "express";
import { authenticate } from "../../common/middleware/auth.middleware.js";
import { validate } from "../../common/middleware/validate.middleware.js";
import { asyncHandler } from "../../common/utils/asyncHandler.js";
import { requireOrgRole } from "../organizations/org.rbac.js";
import {
  deleteDocumentHandler,
  getDocumentHandler,
  listDocumentsHandler,
  uploadDocumentHandler
} from "./kb.controller.js";
import { documentIdParamSchema, orgIdParamSchema } from "./kb.schema.js";
import { uploadKnowledgeDocument } from "./kb.upload.js";

export const kbRoutes = Router({
  mergeParams: true
});

kbRoutes.use(authenticate);

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
  uploadKnowledgeDocument.single("file"),
  asyncHandler(uploadDocumentHandler)
);

kbRoutes.get(
  "/documents/:documentId",
  validate(documentIdParamSchema),
  requireOrgRole(["OWNER", "ADMIN", "AGENT"]),
  asyncHandler(getDocumentHandler)
);

kbRoutes.delete(
  "/documents/:documentId",
  validate(documentIdParamSchema),
  requireOrgRole(["OWNER", "ADMIN"]),
  asyncHandler(deleteDocumentHandler)
);