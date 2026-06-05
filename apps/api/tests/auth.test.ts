import request from "supertest";
import { app } from "../src/app.js";
import { prisma } from "../src/config/prisma.js";

describe("Auth API", () => {
  const testEmail = `auth-${Date.now()}@supportiq.test`;
  const password = "password123";

  let accessToken: string;
  let refreshToken: string;

  afterAll(async () => {
    await prisma.user.deleteMany({
      where: {
        email: testEmail
      }
    });

    await prisma.$disconnect();
  });

  it("registers a new user", async () => {
    const response = await request(app)
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
    expect(response.body.data.refreshToken).toBeDefined();

    accessToken = response.body.data.accessToken;
    refreshToken = response.body.data.refreshToken;
  });

  it("rejects duplicate email registration", async () => {
    const response = await request(app)
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
    const response = await request(app)
      .post("/api/v1/auth/login")
      .send({
        email: testEmail,
        password
      })
      .expect(200);

    expect(response.body.message).toBe("Logged in successfully");
    expect(response.body.data.accessToken).toBeDefined();
    expect(response.body.data.refreshToken).toBeDefined();

    accessToken = response.body.data.accessToken;
    refreshToken = response.body.data.refreshToken;
  });

  it("returns current user with valid access token", async () => {
    const response = await request(app)
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${accessToken}`)
      .expect(200);

    expect(response.body.data.user.email).toBe(testEmail);
  });

  it("refreshes access token using refresh token", async () => {
    const response = await request(app)
      .post("/api/v1/auth/refresh")
      .send({
        refreshToken
      })
      .expect(200);

    expect(response.body.message).toBe("Token refreshed successfully");
    expect(response.body.data.accessToken).toBeDefined();
    expect(response.body.data.refreshToken).toBeDefined();

    refreshToken = response.body.data.refreshToken;
  });

  it("logs out successfully", async () => {
    const response = await request(app)
      .post("/api/v1/auth/logout")
      .send({
        refreshToken
      })
      .expect(200);

    expect(response.body.message).toBe("Logged out successfully");
  });
});