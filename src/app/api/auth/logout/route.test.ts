import { describe, it, expect, beforeEach } from "vitest";
import { POST } from "./route";
import { prisma } from "@/lib/prisma";
import {
  truncateAll,
  createTestUser,
  createTestSession,
  bearerHeader,
} from "@/test/db";

describe("POST /api/auth/logout", () => {
  let token: string;

  beforeEach(async () => {
    await truncateAll();
    const user = await createTestUser();
    token = await createTestSession(user.id);
  });

  function makeRequest(headers: Record<string, string> = {}): Request {
    return new Request("http://localhost/api/auth/logout", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
    });
  }

  it("returns 200, deletes session row, and clears cookie on valid token", async () => {
    const res = await POST(makeRequest(bearerHeader(token)));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.message).toBe("Logged out");

    // Session row must be gone
    const session = await prisma.session.findUnique({ where: { token } });
    expect(session).toBeNull();

    // Cookie must be cleared
    const cookie = res.headers.get("Set-Cookie");
    expect(cookie).toContain("session=");
    expect(cookie).toContain("Max-Age=0");
  });

  it("returns 401 when no token is provided", async () => {
    const res = await POST(makeRequest());
    expect(res.status).toBe(401);
  });

  it("returns 401 when the session token is expired", async () => {
    // Create a user and insert an expired session directly
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

    const res = await POST(makeRequest(bearerHeader(expiredSession.token)));
    expect(res.status).toBe(401);
  });
});
