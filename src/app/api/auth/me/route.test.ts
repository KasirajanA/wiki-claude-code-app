import { describe, it, expect, beforeEach } from "vitest";
import { GET } from "./route";
import { prisma } from "@/lib/prisma";
import {
  truncateAll,
  createTestUser,
  createTestSession,
  bearerHeader,
} from "@/test/db";

describe("GET /api/auth/me", () => {
  let token: string;
  let userId: string;

  beforeEach(async () => {
    await truncateAll();
    const user = await createTestUser({ role: "EDITOR" });
    userId = user.id;
    token = await createTestSession(user.id);
  });

  function makeRequest(headers: Record<string, string> = {}): Request {
    return new Request("http://localhost/api/auth/me", {
      method: "GET",
      headers: { ...headers },
    });
  }

  it("returns 200 with user fields on valid token", async () => {
    const res = await GET(makeRequest(bearerHeader(token)));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.id).toBe(userId);
    expect(body.email).toBe("test@example.com");
    expect(body.username).toBe("testuser");
    expect(body.role).toBe("EDITOR");
    // Sensitive field must not be returned
    expect(body.passwordHash).toBeUndefined();
  });

  it("returns 401 when no token is provided", async () => {
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
  });

  it("returns 401 when the session token is expired", async () => {
    const user = await createTestUser({
      email: "expired@example.com",
      username: "expireduser",
    });
    const expiredSession = await prisma.session.create({
      data: {
        userId: user.id,
        expiresAt: new Date(Date.now() - 1000), // 1 second in the past
      },
    });

    const res = await GET(makeRequest(bearerHeader(expiredSession.token)));
    expect(res.status).toBe(401);
  });
});
