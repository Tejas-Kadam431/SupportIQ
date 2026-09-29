import { comparePassword } from "../common/utils/password.js";
import { prisma } from "../config/prisma.js";
import { loginUser, refreshAccessToken, logoutUser } from "../modules/auth/auth.service.js";
import { hashRefreshToken } from "../common/utils/refreshToken.js";

jest.mock("../config/prisma.js", () => ({ prisma: {
  user: { findUnique: jest.fn() }, refreshToken: { findFirst: jest.fn() },
  refreshSession: { create: jest.fn(), updateMany: jest.fn() }, $transaction: jest.fn()
} }));
jest.mock("../common/utils/password.js", () => ({ comparePassword: jest.fn(async () => true) }));
jest.mock("../common/utils/jwt.js", () => ({ signAccessToken: jest.fn(() => "access") }));

const raw = "a".repeat(128);
const user = { id: "user", email: "a@example.test", name: "A", avatarUrl: null, createdAt: new Date(), updatedAt: new Date() };
const future = new Date(Date.now() + 86400000);
const tx = {
  $queryRaw: jest.fn(),
  refreshToken: { findUnique: jest.fn(), updateMany: jest.fn(), create: jest.fn() },
  refreshSession: { findUnique: jest.fn(), update: jest.fn() }
};
let log: jest.SpyInstance;
beforeEach(() => {
  jest.resetAllMocks();
  (comparePassword as jest.Mock).mockResolvedValue(true);
  (prisma.refreshSession.create as jest.Mock).mockResolvedValue({});
  (prisma.refreshSession.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
  log = jest.spyOn(console, "warn").mockImplementation(() => {});
  (prisma.user.findUnique as jest.Mock).mockResolvedValue(user);
  (prisma.refreshToken.findFirst as jest.Mock).mockResolvedValue({ id: "token", sessionId: "session" });
  (prisma.$transaction as jest.Mock).mockImplementation(async fn => fn(tx));
  tx.refreshSession.findUnique.mockResolvedValue({ id: "session", userId: "user", expiresAt: future, revokedAt: null });
  tx.refreshToken.findUnique.mockResolvedValue({ id: "token", sessionId: "session", userId: "user", user, expiresAt: future, revokedAt: null, consumedAt: null });
  tx.refreshToken.updateMany.mockResolvedValue({ count: 1 });
});
afterEach(() => log.mockRestore());

test("login creates one family with a hashed initial credential and shared expiry", async () => {
  const result = await loginUser({ email: user.email, password: "password" });
  const data = (prisma.refreshSession.create as jest.Mock).mock.calls[0][0].data;
  expect(data.tokens.create.tokenHash).toBe(hashRefreshToken(result.refreshToken));
  expect(JSON.stringify(data)).not.toContain(result.refreshToken);
  expect(data.expiresAt).toEqual(result.refreshExpiresAt);
  expect(data.tokens.create.expiresAt).toEqual(data.expiresAt);
});

test("rotation consumes conditionally, keeps the family and its absolute expiry", async () => {
  const result = await refreshAccessToken(raw);
  expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
  expect(tx.refreshToken.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ consumedAt: null, revokedAt: null }) }));
  expect(tx.refreshToken.create).toHaveBeenCalledWith({ data: {
    userId: "user", sessionId: "session", tokenHash: hashRefreshToken(result.refreshToken), expiresAt: future
  } });
  expect(result.refreshExpiresAt).toEqual(future);
});

test("reuse commits family revocation before returning generic 401", async () => {
  tx.refreshToken.findUnique.mockResolvedValue({ id: "token", sessionId: "session", userId: "user", user, expiresAt: future, consumedAt: new Date(), revokedAt: new Date() });
  let committed = false;
  (prisma.$transaction as jest.Mock).mockImplementation(async fn => { const result = await fn(tx); committed = true; return result; });
  await expect(refreshAccessToken(raw)).rejects.toMatchObject({ statusCode: 401, message: "Invalid or expired refresh token" });
  expect(committed).toBe(true);
  expect(tx.refreshSession.update).toHaveBeenCalledWith({ where: { id: "session" }, data: { revokedAt: expect.any(Date), revokeReason: "REUSE_DETECTED" } });
  expect(tx.refreshToken.create).not.toHaveBeenCalled();
  expect(log).toHaveBeenCalledWith({ event: "auth.refresh_denied", reason: "reused" });
});

test.each(["malformed", "unknown", "legacy", "expired", "session_expired", "session_revoked", "revoked"])("%s is denied distinctly without falsely detecting reuse", async reason => {
  if (reason === "unknown") (prisma.refreshToken.findFirst as jest.Mock).mockResolvedValue(null);
  if (reason === "legacy") (prisma.refreshToken.findFirst as jest.Mock).mockResolvedValue({ id: "legacy", sessionId: null });
  if (reason === "expired" || reason === "revoked") tx.refreshToken.findUnique.mockResolvedValue({
    id: "token", sessionId: "session", userId: "user", user,
    expiresAt: reason === "expired" ? new Date(0) : future,
    revokedAt: reason === "revoked" ? new Date() : null
  });
  if (reason.startsWith("session_")) tx.refreshSession.findUnique.mockResolvedValue({
    id: "session", userId: "user", expiresAt: reason === "session_expired" ? new Date(0) : future,
    revokedAt: reason === "session_revoked" ? new Date() : null
  });
  await expect(refreshAccessToken(reason === "malformed" ? "bad" : raw)).rejects.toMatchObject({ statusCode: 401 });
  expect(tx.refreshToken.create).not.toHaveBeenCalled();
  expect(tx.refreshSession.update).not.toHaveBeenCalled();
  expect(log).toHaveBeenCalledWith({ event: "auth.refresh_denied", reason });
  expect(JSON.stringify(log.mock.calls)).not.toContain(raw);
});

test("logout of a consumed credential still revokes its current family", async () => {
  await logoutUser(raw);
  expect(prisma.refreshSession.updateMany).toHaveBeenCalledWith({
    where: { id: "session", revokedAt: null }, data: { revokedAt: expect.any(Date), revokeReason: "LOGOUT" }
  });
});

test("replacement failure propagates out of the transaction instead of returning credentials", async () => {
  tx.refreshToken.create.mockRejectedValue(new Error("injected failure"));
  const errorLog = jest.spyOn(console, "error").mockImplementation(() => {});
  try {
    await expect(refreshAccessToken(raw)).rejects.toMatchObject({ statusCode: 503 });
    expect(errorLog.mock.calls).toEqual([[{ event: "auth.storage_failed" }]]);
  } finally { errorLog.mockRestore(); }
  expect(tx.refreshSession.update).not.toHaveBeenCalled();
});
