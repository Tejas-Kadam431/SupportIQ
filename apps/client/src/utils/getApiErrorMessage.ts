import type { FetchBaseQueryError } from "@reduxjs/toolkit/query";
import type { SerializedError } from "@reduxjs/toolkit";

type ApiErrorBody = {
  message?: string;
  error?: string;
};

function isFetchBaseQueryError(error: unknown): error is FetchBaseQueryError {
  return typeof error === "object" && error !== null && "status" in error;
}

function isSerializedError(error: unknown): error is SerializedError {
  return typeof error === "object" && error !== null && "message" in error;
}

export function getApiErrorMessage(error: unknown, fallback: string) {
  if (isFetchBaseQueryError(error)) {
    const data = error.data;

    if (typeof data === "string" && data.trim()) {
      return data;
    }

    if (typeof data === "object" && data !== null) {
      const body = data as ApiErrorBody;

      if (body.message) {
        return body.message;
      }

      if (body.error) {
        return body.error;
      }
    }
  }

  if (isSerializedError(error) && error.message) {
    return error.message;
  }

  return fallback;
}