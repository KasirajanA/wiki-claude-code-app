import { prisma } from "@/lib/prisma";

/**
 * Truncates all user-data tables in FK-safe order.
 * Call in beforeEach for integration tests.
 */
export async function truncateAll(): Promise<void> {
  await prisma.$executeRawUnsafe(
    `TRUNCATE "Session", "ArticleTag", "Revision", "Article", "Tag", "User" RESTART IDENTITY CASCADE`,
  );
}

/**
 * Creates a minimal user directly in the DB (bypasses API).
 * Useful for seeding test fixtures.
 */
export async function createTestUser(overrides?: Partial<{
  email: string;
  username: string;
  passwordHash: string;
  role: "VIEWER" | "EDITOR" | "ADMIN";
}>) {
  const bcrypt = await import("bcryptjs");
  return prisma.user.create({
    data: {
      email: overrides?.email ?? "test@example.com",
      username: overrides?.username ?? "testuser",
      passwordHash: overrides?.passwordHash ?? await bcrypt.hash("Password123!", 4),
      role: overrides?.role ?? "VIEWER",
    },
  });
}

/**
 * Creates a session for the given user and returns the token.
 */
export async function createTestSession(userId: string): Promise<string> {
  const { sessionExpiresAt } = await import("@/lib/auth");
  const session = await prisma.session.create({
    data: {
      userId,
      expiresAt: sessionExpiresAt(),
    },
  });
  return session.token;
}

/** Returns an Authorization header value for the given token */
export function bearerHeader(token: string): { Authorization: string } {
  return { Authorization: `Bearer ${token}` };
}
