import fs from "node:fs";
import path from "node:path";

export const UPLOAD_ROOT_DIR =
  process.env.UPLOAD_ROOT_DIR ?? path.join(process.cwd(), "uploads");

export const KNOWLEDGE_UPLOAD_DIR = path.join(
  UPLOAD_ROOT_DIR,
  "knowledge-base"
);

export function ensureUploadDirectories() {
  fs.mkdirSync(KNOWLEDGE_UPLOAD_DIR, {
    recursive: true
  });
}