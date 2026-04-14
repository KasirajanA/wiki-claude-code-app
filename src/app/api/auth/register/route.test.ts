import { describe, it, expect, beforeEach } from "vitest";
import { POST } from "./route";
import { truncateAll, createTestUser } from "@/test/db";

describe("POST /api/auth/register", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  const validPayload = {
    email: "alice@example.com",
    username: "alice",
    password: "Password123!",
  };

  function makeRequest(body: unknown): Request {
    return new Request("http://localhost/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  it("returns 201 with token and user on valid input", async () => {
    const res = await POST(makeRequest(validPayload));
    expect(res.status).toBe(201);

    const body = await res.json();
    expect(body.token).toBeTruthy();
    expect(body.user.email).toBe("alice@example.com");
    expect(body.user.username).toBe("alice");
    expect(body.user.role).toBe("VIEWER");
    expect(body.user.id).toBeTruthy();
    // passwordHash must not be exposed
    expect(body.user.passwordHash).toBeUndefined();
  });

  it("sets session token in Set-Cookie header", async () => {
    const res = await POST(makeRequest(validPayload));
    const cookie = res.headers.get("Set-Cookie");
    expect(cookie).toBeTruthy();
    expect(cookie).toContain("session=");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Max-Age=604800");
  });

  it("returns 409 on duplicate email", async () => {
    await createTestUser({ email: "alice@example.com", username: "existing" });
    const res = await POST(makeRequest(validPayload));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBeTruthy();
  });

  it("returns 409 on duplicate username", async () => {
    await createTestUser({ email: "other@example.com", username: "alice" });
    const res = await POST(makeRequest(validPayload));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBeTruthy();
  });

  it("returns 400 on invalid email", async () => {
    const res = await POST(makeRequest({ ...validPayload, email: "not-an-email" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Validation failed");
  });

  it("returns 400 on short password", async () => {
    const res = await POST(makeRequest({ ...validPayload, password: "short" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Validation failed");
  });

  it("returns 400 on missing fields", async () => {
    const res = await POST(makeRequest({ email: "alice@example.com" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Validation failed");
    expect(body.issues).toBeDefined();
  });
});
