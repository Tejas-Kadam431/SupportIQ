import { createHash } from "node:crypto";
export function contentHash(value: string | Uint8Array) { return createHash("sha256").update(value).digest("hex"); }
