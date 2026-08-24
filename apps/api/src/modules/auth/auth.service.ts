import { prisma } from "../../config/prisma.js";
import { AppError } from "../../common/errors/AppError.js";
import { comparePassword, hashPassword } from "../../common/utils/password.js";
import { signAccessToken } from "../../common/utils/jwt.js";
import {
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

  await prisma.refreshToken.create({
    data: {
      userId,
      tokenHash: hashRefreshToken(refreshToken),
      expiresAt: getRefreshTokenExpiryDate()
    }
  });

  return refreshToken;
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
  const refreshToken = await createRefreshToken(user.id);

  return {
    user: sanitizeUser(user),
    accessToken,
    refreshToken
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
  const refreshToken = await createRefreshToken(user.id);

  return {
    user: sanitizeUser(user),
    accessToken,
    refreshToken
  };
}

export async function refreshAccessToken(refreshToken: string) {
  const tokenHash = hashRefreshToken(refreshToken);
  const now = new Date();

  const storedToken = await prisma.refreshToken.findFirst({
    where: {
      tokenHash,
      revokedAt: null,
      expiresAt: {
        gt: now
      }
    },
    include: {
      user: true
    }
  });

  if (!storedToken) {
    throw new AppError("Invalid or expired refresh token", 401);
  }

  const newRefreshToken = generateRefreshToken();
  const newRefreshTokenHash = hashRefreshToken(newRefreshToken);
  const newRefreshTokenExpiresAt = getRefreshTokenExpiryDate();

  await prisma.$transaction(async (tx) => {
    const consumeResult = await tx.refreshToken.updateMany({
      where: {
        id: storedToken.id,
        revokedAt: null,
        expiresAt: {
          gt: now
        }
      },
      data: {
        revokedAt: now
      }
    });

    if (consumeResult.count !== 1) {
      throw new AppError("Invalid or expired refresh token", 401);
    }

    await tx.refreshToken.create({
      data: {
        userId: storedToken.userId,
        tokenHash: newRefreshTokenHash,
        expiresAt: newRefreshTokenExpiresAt
      }
    });
  });

  const newAccessToken = signAccessToken(storedToken.userId);

  return {
    user: sanitizeUser(storedToken.user),
    accessToken: newAccessToken,
    refreshToken: newRefreshToken
  };
}

export async function logoutUser(refreshToken: string) {
  const tokenHash = hashRefreshToken(refreshToken);

  await prisma.refreshToken.updateMany({
    where: {
      tokenHash,
      revokedAt: null
    },
    data: {
      revokedAt: new Date()
    }
  });
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