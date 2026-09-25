import jwt from "jsonwebtoken";
import express from "express";
import request from "supertest";
import { signAccessToken, verifyAccessToken } from "../common/utils/jwt.js";
import { authenticate } from "../common/middleware/auth.middleware.js";
import { errorHandler } from "../common/errors/errorHandler.js";

jest.mock("../config/env.js", () => ({ env: {
  JWT_ACCESS_SECRET: "test-only-secret", JWT_ACCESS_EXPIRES_IN: "15m"
} }));

test("current issued tokens remain valid for HTTP and sockets", async () => {
  const token = signAccessToken("agent");
  expect(verifyAccessToken(token)).toEqual({ sub: "agent", exp: expect.any(Number) });
  const app = express();
  app.get("/", authenticate, (_req, res) => { res.sendStatus(200); });
  app.use(errorHandler);
  await request(app).get("/").set("Authorization", `Bearer ${token}`).expect(200);
  await request(app).get("/").set("Authorization", "Bearer invalid").expect(401);
});

test.each([
  { exp: 9999999999 }, { sub: "agent" }, { sub: "" , exp: 9999999999 },
  { sub: "  ", exp: 9999999999 }, { sub: "agent", exp: 1 },
  { sub: "agent", exp: 9999999999.5 }, { sub: "agent", exp: Number.MAX_SAFE_INTEGER }
])("rejects invalid claims %j", payload => {
  const token = jwt.sign(payload, "test-only-secret");
  expect(() => verifyAccessToken(token)).toThrow();
});

test("pins signature algorithm and secret", () => {
  const payload = { sub: "agent", exp: 9999999999 };
  expect(() => verifyAccessToken(jwt.sign(payload, "test-only-secret", { algorithm: "HS384" }))).toThrow();
  expect(() => verifyAccessToken(jwt.sign(payload, "wrong-secret"))).toThrow();
});
