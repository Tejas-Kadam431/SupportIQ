import { AppError } from "../../common/errors/AppError.js";

type RefreshFailure = "malformed" | "unknown" | "legacy" | "expired" | "session_expired" |
  "session_revoked" | "revoked" | "reused" | "rotation_conflict";

// Fixed fields only. Never serialize credentials, hashes, request objects or raw errors.
export function logRefreshFailure(reason: RefreshFailure) {
  console.warn({ event: "auth.refresh_denied", reason });
}

export function authStorageFailure(_error: unknown): never {
  // Prisma errors can contain query arguments. Do not pass them to the global logger.
  console.error({ event: "auth.storage_failed" });
  throw new AppError("Authentication service unavailable", 503);
}
