import type { RefreshRevokeReason } from "@prisma/client";
import { authStorageFailure, logRefreshFailure } from "./auth.security.js";
import { prisma } from "../../config/prisma.js";
import { AppError } from "../../common/errors/AppError.js";
import { comparePassword, hashPassword } from "../../common/utils/password.js";
import { signAccessToken } from "../../common/utils/jwt.js";
import {
  isRefreshToken,
  generateRefreshToken,
  getRefreshTokenExpiryDate,
  hashRefreshToken
} from "../../common/utils/refreshToken.js";
import type { LoginInput, RegisterInput } from "./auth.schema.js";

function sanitizeUser(user: {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    avatarUrl: user.avatarUrl,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt
  };
}

async function createRefreshToken(userId: string) {
  const refreshToken = generateRefreshToken();
  const refreshExpiresAt = getRefreshTokenExpiryDate();
  await prisma.refreshSession.create({
    data: {
      userId, expiresAt: refreshExpiresAt,
      tokens: { create: { userId, tokenHash: hashRefreshToken(refreshToken), expiresAt: refreshExpiresAt } }
    }
  }).catch(authStorageFailure);
  return { refreshToken, refreshExpiresAt };
}

export async function registerUser(input: RegisterInput) {
  const existingUser = await prisma.user.findUnique({
    where: {
      email: input.email.toLowerCase()
    }
  });

  if (existingUser) {
    throw new AppError("Email is already registered", 409);
  }

  const passwordHash = await hashPassword(input.password);

  const user = await prisma.user.create({
    data: {
      name: input.name,
      email: input.email.toLowerCase(),
      passwordHash
    }
  });

  const accessToken = signAccessToken(user.id);
  const credential = await createRefreshToken(user.id);

  return {
    user: sanitizeUser(user),
    accessToken,
    ...credential
  };
}

export async function loginUser(input: LoginInput) {
  const user = await prisma.user.findUnique({
    where: {
      email: input.email.toLowerCase()
    }
  });

  if (!user) {
    throw new AppError("Invalid email or password", 401);
  }

  const isPasswordValid = await comparePassword(input.password, user.passwordHash);

  if (!isPasswordValid) {
    throw new AppError("Invalid email or password", 401);
  }

  const accessToken = signAccessToken(user.id);
  const credential = await createRefreshToken(user.id);

  return {
    user: sanitizeUser(user),
    accessToken,
    ...credential
  };
}

export async function refreshAccessToken(refreshToken: string) {
  const denied = () => new AppError("Invalid or expired refresh token", 401);
  if (!isRefreshToken(refreshToken)) {
    logRefreshFailure("malformed");
    throw denied();
  }
  const tokenHash = hashRefreshToken(refreshToken);
  // Locate family first; all rotation/revocation decisions happen after its row lock.
  const candidate = await prisma.refreshToken.findFirst({ where: { tokenHash } }).catch(authStorageFailure);
  if (!candidate?.sessionId) {
    logRefreshFailure(candidate ? "legacy" : "unknown");
    throw denied();
  }
  const sessionId = candidate.sessionId;
  const result = await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT "id" FROM "RefreshSession" WHERE "id" = ${sessionId} FOR UPDATE`;
    const now = new Date();
    const session = await tx.refreshSession.findUnique({ where: { id: sessionId } });
    const token = await tx.refreshToken.findUnique({ where: { id: candidate.id }, include: { user: true } });
    if (!session || !token || token.sessionId !== session.id || token.userId !== session.userId) {
      return { failure: "unknown" as const };
    }
    if (session.revokedAt) return { failure: "session_revoked" as const };
    if (session.expiresAt <= now) return { failure: "session_expired" as const };
    if (token.expiresAt <= now) return { failure: "expired" as const };
    if (token.consumedAt) {
      await tx.refreshSession.update({ where: { id: session.id }, data: { revokedAt: now, revokeReason: "REUSE_DETECTED" } });
      // Return, don't throw: family revocation must COMMIT before the external 401.
      return { failure: "reused" as const };
    }
    if (token.revokedAt) return { failure: "revoked" as const };
    const consumed = await tx.refreshToken.updateMany({
      where: { id: token.id, consumedAt: null, revokedAt: null, expiresAt: { gt: now } },
      data: { consumedAt: now, revokedAt: now }
    });
    if (consumed.count !== 1) {
      await tx.refreshSession.update({ where: { id: session.id }, data: { revokedAt: now, revokeReason: "REUSE_DETECTED" } });
      return { failure: "rotation_conflict" as const };
    }
    const replacement = generateRefreshToken();
    await tx.refreshToken.create({ data: {
      userId: token.userId, sessionId: session.id,
      tokenHash: hashRefreshToken(replacement), expiresAt: session.expiresAt
    } });
    await tx.refreshSession.update({ where: { id: session.id }, data: { lastUsedAt: now } });
    return { user: sanitizeUser(token.user), accessToken: signAccessToken(token.userId),
      refreshToken: replacement, refreshExpiresAt: session.expiresAt };
  }, { isolationLevel: "ReadCommitted" }).catch(authStorageFailure);
  if ("failure" in result) {
    logRefreshFailure(result.failure!);
    throw denied();
  }
  return result;
}

export async function revokeRefreshSession(sessionId: string, reason: RefreshRevokeReason) {
  // UPDATE takes the same row lock as rotation; a waiting rotation rereads revokedAt.
  await prisma.refreshSession.updateMany({
    where: { id: sessionId, revokedAt: null }, data: { revokedAt: new Date(), revokeReason: reason }
  }).catch(authStorageFailure);
}

export async function logoutUser(refreshToken: string) {
  if (!isRefreshToken(refreshToken)) return;
  const token = await prisma.refreshToken.findFirst({ where: { tokenHash: hashRefreshToken(refreshToken) } }).catch(authStorageFailure);
  if (token?.sessionId) await revokeRefreshSession(token.sessionId, "LOGOUT");
}

export async function getUserById(userId: string) {
  const user = await prisma.user.findUnique({
    where: {
      id: userId
    }
  });

  if (!user) {
    throw new AppError("User not found", 404);
  }

  return sanitizeUser(user);
}
