import jwt from "jsonwebtoken";
import { env } from "../../config/env.js";

type AccessTokenPayload = {
  sub: string;
  exp: number;
};

export function signAccessToken(userId: string) {
  return jwt.sign(
    { sub: userId },
    env.JWT_ACCESS_SECRET,
    {
      algorithm: "HS256",
      expiresIn: env.JWT_ACCESS_EXPIRES_IN
    } as jwt.SignOptions
  );
}

export function verifyAccessToken(token: string) {
  const payload = jwt.verify(token, env.JWT_ACCESS_SECRET, { algorithms: ["HS256"] });
  if (
    typeof payload === "string" ||
    typeof payload.sub !== "string" || !payload.sub.trim() ||
    typeof payload.exp !== "number" || !Number.isSafeInteger(payload.exp) ||
    payload.exp <= Date.now() / 1000 ||
    payload.exp > Number.MAX_SAFE_INTEGER / 1000
  ) {
    throw new Error("Invalid access token claims");
  }
  return { sub: payload.sub, exp: payload.exp } satisfies AccessTokenPayload;
}
