import { AppError } from "../../common/errors/AppError.js";

export function copilotStorageFailure(error: unknown): never {
  if (error instanceof AppError) throw error;
  // ORM errors may embed snapshot content. Never forward them to generic logging.
  console.error({ event: "copilot.history_storage_failed" });
  throw new AppError("Copilot history could not be saved", 503);
}
