import multer from "multer";
import { ingestionConfig } from "../../config/ingestion.js";
export const uploadKnowledgeDocument = multer({ storage: multer.memoryStorage(), limits: { fileSize: ingestionConfig.KNOWLEDGE_MAX_BYTES, files: 1, fields: 10 } });
