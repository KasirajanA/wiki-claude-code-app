import { describe, it, expect, beforeEach } from "vitest";
import { POST } from "./route";
import { truncateAll, createTestUser } from "@/test/db";

describe("POST /api/auth/login", () => {
  beforeEach(async () => {
    await truncateAll();
    await createTestUser({ role: "EDITOR" });
  });

  function makeRequest(body: unknown): Request {
    return new Request("http://localhost/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  it("returns 200 with token and user on correct credentials", async () => {
    const res = await POST(
      makeRequest({ email: "test@example.com", password: "Password123!" }),
    );
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.token).toBeTruthy();
    expect(body.user.email).toBe("test@example.com");
    expect(body.user.username).toBe("testuser");
    expect(body.user.role).toBe("EDITOR");
    expect(body.user.id).toBeTruthy();
    expect(body.user.passwordHash).toBeUndefined();
  });

  it("sets session token in Set-Cookie header", async () => {
    const res = await POST(
      makeRequest({ email: "test@example.com", password: "Password123!" }),
    );
    const cookie = res.headers.get("Set-Cookie");
    expect(cookie).toBeTruthy();
    expect(cookie).toContain("session=");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Max-Age=604800");
  });

  it("returns 401 on wrong password", async () => {
    const res = await POST(
      makeRequest({ email: "test@example.com", password: "WrongPassword!" }),
    );
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBeTruthy();
  });

  it("returns 401 on unknown email", async () => {
    const res = await POST(
      makeRequest({ email: "nobody@example.com", password: "Password123!" }),
    );
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBeTruthy();
  });

  it("returns 400 on invalid schema (empty password)", async () => {
    const res = await POST(
      makeRequest({ email: "test@example.com", password: "" }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Validation failed");
  });

  it("returns 400 on invalid schema (missing email)", async () => {
    const res = await POST(makeRequest({ password: "Password123!" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Validation failed");
    expect(body.issues).toBeDefined();
  });
});
