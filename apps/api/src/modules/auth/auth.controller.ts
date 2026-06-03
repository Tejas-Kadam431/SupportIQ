import type { Request, Response } from "express";
import { AppError } from "../../common/errors/AppError.js";
import type { AuthenticatedRequest } from "../../common/middleware/auth.middleware.js";
import {
  getUserById,
  loginUser,
  logoutUser,
  refreshAccessToken,
  registerUser
} from "./auth.service.js";

const REFRESH_COOKIE_NAME = "supportiq_refresh_token";

function setRefreshTokenCookie(res: Response, refreshToken: string) {
  res.cookie(REFRESH_COOKIE_NAME, refreshToken, {
    httpOnly: true,
    secure: false,
    sameSite: "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000
  });
}

function clearRefreshTokenCookie(res: Response) {
  res.clearCookie(REFRESH_COOKIE_NAME);
}

function getRefreshTokenFromRequest(req: Request) {
  return req.cookies?.[REFRESH_COOKIE_NAME] || req.body.refreshToken;
}

export async function register(req: Request, res: Response) {
  const result = await registerUser(req.body);

  setRefreshTokenCookie(res, result.refreshToken);

  return res.status(201).json({
    message: "Registered successfully",
    data: result
  });
}

export async function login(req: Request, res: Response) {
  const result = await loginUser(req.body);

  setRefreshTokenCookie(res, result.refreshToken);

  return res.status(200).json({
    message: "Logged in successfully",
    data: result
  });
}

export async function refresh(req: Request, res: Response) {
  const refreshToken = getRefreshTokenFromRequest(req);

  if (!refreshToken) {
    throw new AppError("Refresh token is required", 401);
  }

  const result = await refreshAccessToken(refreshToken);

  setRefreshTokenCookie(res, result.refreshToken);

  return res.status(200).json({
    message: "Token refreshed successfully",
    data: result
  });
}

export async function logout(req: Request, res: Response) {
  const refreshToken = getRefreshTokenFromRequest(req);

  if (refreshToken) {
    await logoutUser(refreshToken);
  }

  clearRefreshTokenCookie(res);

  return res.status(200).json({
    message: "Logged out successfully"
  });
}

export async function me(req: AuthenticatedRequest, res: Response) {
  if (!req.user) {
    throw new AppError("Authentication required", 401);
  }

  const user = await getUserById(req.user.id);

  return res.status(200).json({
    data: {
      user
    }
  });
}