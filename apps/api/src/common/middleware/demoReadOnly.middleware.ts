import type { NextFunction, Response } from "express";
import { prisma } from "../../config/prisma.js";
import { AppError } from "../errors/AppError.js";
import type { AuthenticatedRequest } from "./auth.middleware.js";

const DEFAULT_DEMO_EMAIL = "demo.owner@supportiq.app";

function getDemoReadonlyEmails() {
  return (process.env.DEMO_READONLY_EMAILS ?? DEFAULT_DEMO_EMAIL)
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export async function isDemoReadonlyUserId(userId: string | undefined) {
  if (!userId) {
    return false;
  }

  const user = await prisma.user.findUnique({
    where: {
      id: userId
    },
    select: {
      email: true
    }
  });

  if (!user) {
    return false;
  }

  return getDemoReadonlyEmails().includes(user.email.toLowerCase());
}

export function blockDemoWrites(
  message = "Demo account is read-only. Please create your own account to modify data."
) {
  return async (
    req: AuthenticatedRequest,
    _res: Response,
    next: NextFunction
  ) => {
    try {
      const isDemoReadonly = await isDemoReadonlyUserId(req.user?.id);

      if (isDemoReadonly) {
        throw new AppError(message, 403);
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}