import jwt from "jsonwebtoken";
import { env } from "../../config/env.js";

type AccessTokenPayload = {
  sub: string;
};

export function signAccessToken(userId: string) {
  return jwt.sign(
    { sub: userId },
    env.JWT_ACCESS_SECRET,
    {
      expiresIn: env.JWT_ACCESS_EXPIRES_IN
    } as jwt.SignOptions
  );
}

export function verifyAccessToken(token: string) {
  return jwt.verify(token, env.JWT_ACCESS_SECRET) as AccessTokenPayload;
}