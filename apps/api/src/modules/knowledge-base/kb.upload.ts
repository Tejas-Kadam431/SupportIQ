import path from "path";
import multer from "multer";
import { AppError } from "../../common/errors/AppError.js";

const UPLOAD_DIR = path.join(process.cwd(), "uploads", "kb");

const allowedMimeTypes = new Set([
  "application/pdf",
  "text/plain",
  "text/markdown",
  "application/octet-stream"
]);

const allowedExtensions = new Set([".pdf", ".txt", ".md", ".markdown"]);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (_req, file, cb) => {
    const extension = path.extname(file.originalname).toLowerCase();
    const safeBaseName = path
      .basename(file.originalname, extension)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)+/g, "");

    const uniqueName = `${Date.now()}-${safeBaseName || "document"}${extension}`;

    cb(null, uniqueName);
  }
});

export const uploadKnowledgeDocument = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024
  },
  fileFilter: (_req, file, cb) => {
    const extension = path.extname(file.originalname).toLowerCase();

    const isAllowedMime = allowedMimeTypes.has(file.mimetype);
    const isAllowedExtension = allowedExtensions.has(extension);

    if (!isAllowedMime && !isAllowedExtension) {
      return cb(
        new AppError("Only PDF, TXT, and Markdown files are allowed", 400)
      );
    }

    cb(null, true);
  }
});