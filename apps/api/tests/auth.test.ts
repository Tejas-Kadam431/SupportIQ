import request from "supertest";
import { app } from "../src/app.js";
import { prisma } from "../src/config/prisma.js";

describe("Auth API", () => {
  const testEmail = `auth-${Date.now()}@supportiq.test`;
  const password = "password123";

  const agent = request.agent(app);

  let accessToken: string;

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

    accessToken = response.body.data.accessToken;
  });

  it("logs out successfully using the refresh cookie", async () => {
    const response = await agent
      .post("/api/v1/auth/logout")
      .send({})
      .expect(200);

    expect(response.body.message).toBe("Logged out successfully");
  });
});