import { describe, it, expect, vi, beforeEach } from "vitest";
import { Role } from "@prisma/client";
import { assertRole } from "./auth";
import { UnauthorizedError, ForbiddenError } from "./errors";
import type { SessionUser } from "./auth";

const makeUser = (role: Role): SessionUser => ({
  id: "user-1",
  email: "u@example.com",
  username: "user",
  role,
});

describe("assertRole", () => {
  it("throws UnauthorizedError when user is null", () => {
    expect(() => assertRole(null, Role.VIEWER)).toThrow(UnauthorizedError);
  });

  it("passes when user role matches minimum", () => {
    expect(() => assertRole(makeUser(Role.VIEWER), Role.VIEWER)).not.toThrow();
    expect(() => assertRole(makeUser(Role.EDITOR), Role.EDITOR)).not.toThrow();
    expect(() => assertRole(makeUser(Role.ADMIN), Role.ADMIN)).not.toThrow();
  });

  it("passes when user role exceeds minimum", () => {
    expect(() => assertRole(makeUser(Role.ADMIN), Role.VIEWER)).not.toThrow();
    expect(() => assertRole(makeUser(Role.ADMIN), Role.EDITOR)).not.toThrow();
    expect(() => assertRole(makeUser(Role.EDITOR), Role.VIEWER)).not.toThrow();
  });

  it("throws ForbiddenError when user role is below minimum", () => {
    expect(() => assertRole(makeUser(Role.VIEWER), Role.EDITOR)).toThrow(ForbiddenError);
    expect(() => assertRole(makeUser(Role.VIEWER), Role.ADMIN)).toThrow(ForbiddenError);
    expect(() => assertRole(makeUser(Role.EDITOR), Role.ADMIN)).toThrow(ForbiddenError);
  });

  it("ForbiddenError has statusCode 403", () => {
    let caught: ForbiddenError | null = null;
    try {
      assertRole(makeUser(Role.VIEWER), Role.EDITOR);
    } catch (e) {
      caught = e as ForbiddenError;
    }
    expect(caught?.statusCode).toBe(403);
  });

  it("UnauthorizedError has statusCode 401", () => {
    let caught: UnauthorizedError | null = null;
    try {
      assertRole(null, Role.VIEWER);
    } catch (e) {
      caught = e as UnauthorizedError;
    }
    expect(caught?.statusCode).toBe(401);
  });
});
