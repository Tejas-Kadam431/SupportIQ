import type { ErrorRequestHandler } from "express";
import { ZodError } from "zod";
import { log, IngestionFailure } from "../operations.js";
import { MulterError } from "multer";
import { AppError } from "./AppError.js";
export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
    if (error instanceof ZodError) {
        return res.status(400).json({
            message: "Validation failed",
            errors: error.flatten().fieldErrors
        });
    }
    if (error instanceof AppError) {
        return res.status(error.statusCode).json({
            message: error.message
        });
    }
    if (error instanceof MulterError)
        return res.status(400).json({ message: "Upload limits exceeded" });
    if (error instanceof IngestionFailure)
        return res.status(error.retryable ? 503 : 400).json({ message: "Knowledge operation unavailable", category: error.category });
    log("http.failed", { requestId: res.locals.requestId, category: "DATABASE_ERROR" });
    return res.status(500).json({
        message: "Internal server error"
    });
};
