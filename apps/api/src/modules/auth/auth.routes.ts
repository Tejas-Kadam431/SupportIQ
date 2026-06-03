import { Router } from "express";
import { asyncHandler } from "../../common/utils/asyncHandler.js";
import { authenticate } from "../../common/middleware/auth.middleware.js";
import { validate } from "../../common/middleware/validate.middleware.js";
import { loginSchema, logoutSchema, refreshSchema, registerSchema } from "./auth.schema.js";
import { login, logout, me, refresh, register } from "./auth.controller.js";

export const authRoutes = Router();

authRoutes.post("/register", validate(registerSchema), asyncHandler(register));
authRoutes.post("/login", validate(loginSchema), asyncHandler(login));
authRoutes.post("/refresh", validate(refreshSchema), asyncHandler(refresh));
authRoutes.post("/logout", validate(logoutSchema), asyncHandler(logout));
authRoutes.get("/me", authenticate, asyncHandler(me));