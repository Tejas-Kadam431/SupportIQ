import crypto from "crypto";

export const REFRESH_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function isRefreshToken(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{128}$/.test(value);
}

export function generateRefreshToken() {
  return crypto.randomBytes(64).toString("hex");
}

export function hashRefreshToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function getRefreshTokenExpiryDate() {
  return new Date(Date.now() + REFRESH_SESSION_TTL_MS);
}
