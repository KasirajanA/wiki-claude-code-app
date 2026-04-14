import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { UnauthorizedError, ForbiddenError } from "@/lib/errors";

export type SessionUser = {
  id: string;
  email: string;
  username: string;
  role: Role;
};

const ROLE_HIERARCHY: Role[] = [Role.VIEWER, Role.EDITOR, Role.ADMIN];

/**
 * Throws UnauthorizedError if user is null, ForbiddenError if role is too low.
 */
export function assertRole(user: SessionUser | null, minimum: Role): void {
  if (!user) throw new UnauthorizedError();
  if (ROLE_HIERARCHY.indexOf(user.role) < ROLE_HIERARCHY.indexOf(minimum)) {
    throw new ForbiddenError();
  }
}

/**
 * Extracts the bearer token from an Authorization header or `session` cookie.
 * Returns null if no token is present (unauthenticated is allowed).
 */
function extractToken(request: Request): string | null {
  const auth = request.headers.get("Authorization");
  if (auth?.startsWith("Bearer ")) return auth.slice(7).trim();

  const cookieHeader = request.headers.get("cookie") ?? "";
  const match = cookieHeader.match(/(?:^|;\s*)session=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

/**
 * Resolves the session token to a SessionUser, or returns null.
 * Lazily deletes expired sessions.
 */
export async function parseSessionToken(
  request: Request,
): Promise<SessionUser | null> {
  const token = extractToken(request);
  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { token },
    include: { user: { select: { id: true, email: true, username: true, role: true } } },
  });

  if (!session) return null;

  if (session.expiresAt < new Date()) {
    await prisma.session.delete({ where: { id: session.id } });
    return null;
  }

  return session.user;
}

/**
 * Like parseSessionToken but throws UnauthorizedError when no valid session.
 */
export async function requireSession(request: Request): Promise<SessionUser> {
  const user = await parseSessionToken(request);
  if (!user) throw new UnauthorizedError();
  return user;
}

/** 7-day session expiry */
export function sessionExpiresAt(): Date {
  return new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
}
