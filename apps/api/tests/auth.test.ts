import request from "supertest";
import { app } from "../src/app.js";
import { prisma } from "../src/config/prisma.js";
function extractCookie(
  setCookieHeader: string | string[] | undefined
) {
  if (!setCookieHeader) {
    throw new Error("Expected Set-Cookie header");
  }

  const firstCookie = Array.isArray(setCookieHeader)
    ? setCookieHeader[0]
    : setCookieHeader;

  return firstCookie.split(";")[0];
}
describe("Auth API", () => {
  const testEmail = `auth-${Date.now()}@supportiq.test`;
  const password = "password123";

  const agent = request.agent(app);

  let accessToken: string;
  let refreshCookie: string;

  afterAll(async () => {
    await prisma.user.deleteMany({
      where: {
        email: testEmail
      }
    });

    await prisma.$disconnect();
  });

  it("registers a new user", async () => {
    const response = await agent
      .post("/api/v1/auth/register")
      .send({
        name: "Auth Test User",
        email: testEmail,
        password
      })
      .expect(201);

    expect(response.body.message).toBe("Registered successfully");

    expect(response.body.data.user.email).toBe(testEmail);
    expect(response.body.data.user.passwordHash).toBeUndefined();

    expect(response.body.data.accessToken).toBeDefined();

    // Refresh token must never be exposed to JavaScript through JSON.
    expect(response.body.data.refreshToken).toBeUndefined();

    // The server should instead store the refresh token in a cookie.
    expect(response.headers["set-cookie"]).toBeDefined();

    accessToken = response.body.data.accessToken;
  });

  it("rejects duplicate email registration", async () => {
    const response = await agent
      .post("/api/v1/auth/register")
      .send({
        name: "Duplicate User",
        email: testEmail,
        password
      })
      .expect(409);

    expect(response.body.message).toBe("Email is already registered");
  });

  it("logs in with valid credentials", async () => {
    const response = await agent
      .post("/api/v1/auth/login")
      .send({
        email: testEmail,
        password
      })
      .expect(200);

    expect(response.body.message).toBe("Logged in successfully");

    expect(response.body.data.accessToken).toBeDefined();

    // Raw refresh token should remain inaccessible to frontend JavaScript.
    expect(response.body.data.refreshToken).toBeUndefined();

    expect(response.headers["set-cookie"]).toBeDefined();
    refreshCookie = extractCookie(response.headers["set-cookie"]);

    accessToken = response.body.data.accessToken;
  });

  it("returns current user with valid access token", async () => {
    const response = await agent
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${accessToken}`)
      .expect(200);

    expect(response.body.data.user.email).toBe(testEmail);
  });

  it("refreshes access token using the HTTP-only refresh cookie", async () => {
    const response = await agent
      .post("/api/v1/auth/refresh")
      .send({})
      .expect(200);

    expect(response.body.message).toBe("Token refreshed successfully");

    expect(response.body.data.accessToken).toBeDefined();

    // Rotation may create a new refresh token internally,
    // but it must only be returned through Set-Cookie.
    expect(response.body.data.refreshToken).toBeUndefined();

    expect(response.headers["set-cookie"]).toBeDefined();
    refreshCookie = extractCookie(response.headers["set-cookie"]);

    accessToken = response.body.data.accessToken;
  });
it("allows only one concurrent refresh using the same refresh token", async () => {
  const [firstResponse, secondResponse] = await Promise.all([
    request(app)
      .post("/api/v1/auth/refresh")
      .set("Cookie", refreshCookie)
      .send({}),

    request(app)
      .post("/api/v1/auth/refresh")
      .set("Cookie", refreshCookie)
      .send({})
  ]);

  const statuses = [
    firstResponse.status,
    secondResponse.status
  ].sort();

  expect(statuses).toEqual([200, 401]);

  const successfulResponse =
    firstResponse.status === 200
      ? firstResponse
      : secondResponse;

  refreshCookie = extractCookie(
    successfulResponse.headers["set-cookie"]
  );

  accessToken = successfulResponse.body.data.accessToken;
});

  it("logs out successfully using the refresh cookie", async () => {
    const response = await request(app)
      .post("/api/v1/auth/logout")
      .set("Cookie", refreshCookie)
      .send({})
      .expect(200);

      expect(response.body.message).toBe(
    "Logged out successfully"
  );
  });
});