import { describe, it, expect } from "vitest";
import {
  RegisterSchema,
  LoginSchema,
  CreateArticleSchema,
  UpdateArticleSchema,
  UpdateUserRoleSchema,
} from "./schemas";

describe("RegisterSchema", () => {
  const valid = { email: "a@b.com", username: "alice", password: "Password1!" };

  it("accepts valid input", () => {
    expect(RegisterSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects invalid email", () => {
    expect(RegisterSchema.safeParse({ ...valid, email: "not-an-email" }).success).toBe(false);
  });

  it("rejects username shorter than 2 chars", () => {
    expect(RegisterSchema.safeParse({ ...valid, username: "a" }).success).toBe(false);
  });

  it("rejects username with special characters", () => {
    expect(RegisterSchema.safeParse({ ...valid, username: "a b" }).success).toBe(false);
  });

  it("rejects password shorter than 8 chars", () => {
    expect(RegisterSchema.safeParse({ ...valid, password: "short" }).success).toBe(false);
  });

  it("rejects password longer than 100 chars", () => {
    expect(RegisterSchema.safeParse({ ...valid, password: "a".repeat(101) }).success).toBe(false);
  });
});

describe("LoginSchema", () => {
  it("accepts valid input", () => {
    expect(LoginSchema.safeParse({ email: "a@b.com", password: "pw" }).success).toBe(true);
  });

  it("rejects empty password", () => {
    expect(LoginSchema.safeParse({ email: "a@b.com", password: "" }).success).toBe(false);
  });
});

describe("CreateArticleSchema", () => {
  const valid = { title: "My Article", content: "Body text here." };

  it("accepts valid minimal input", () => {
    expect(CreateArticleSchema.safeParse(valid).success).toBe(true);
  });

  it("defaults tags to []", () => {
    const result = CreateArticleSchema.safeParse(valid);
    expect(result.success && result.data.tags).toEqual([]);
  });

  it("defaults isPublished to true", () => {
    const result = CreateArticleSchema.safeParse(valid);
    expect(result.success && result.data.isPublished).toBe(true);
  });

  it("rejects more than 10 tags", () => {
    const tags = Array.from({ length: 11 }, (_, i) => `tag${i}`);
    expect(CreateArticleSchema.safeParse({ ...valid, tags }).success).toBe(false);
  });

  it("rejects a tag with uppercase (normalised to lowercase)", () => {
    // TagNameSchema transforms to lowercase — so "TAG" becomes "tag" and is valid
    const result = CreateArticleSchema.safeParse({ ...valid, tags: ["TAG"] });
    expect(result.success && result.data.tags).toEqual(["tag"]);
  });

  it("rejects a tag with spaces", () => {
    expect(CreateArticleSchema.safeParse({ ...valid, tags: ["invalid tag"] }).success).toBe(false);
  });

  it("rejects empty title", () => {
    expect(CreateArticleSchema.safeParse({ ...valid, title: "" }).success).toBe(false);
  });

  it("rejects empty content", () => {
    expect(CreateArticleSchema.safeParse({ ...valid, content: "" }).success).toBe(false);
  });
});

describe("UpdateArticleSchema", () => {
  it("accepts a partial update", () => {
    expect(UpdateArticleSchema.safeParse({ title: "New Title" }).success).toBe(true);
  });

  it("accepts tag update", () => {
    expect(UpdateArticleSchema.safeParse({ tags: ["ref"] }).success).toBe(true);
  });
});

describe("UpdateUserRoleSchema", () => {
  it("accepts valid roles", () => {
    expect(UpdateUserRoleSchema.safeParse({ role: "VIEWER" }).success).toBe(true);
    expect(UpdateUserRoleSchema.safeParse({ role: "EDITOR" }).success).toBe(true);
    expect(UpdateUserRoleSchema.safeParse({ role: "ADMIN" }).success).toBe(true);
  });

  it("rejects unknown role values", () => {
    expect(UpdateUserRoleSchema.safeParse({ role: "SUPERADMIN" }).success).toBe(false);
    expect(UpdateUserRoleSchema.safeParse({ role: "viewer" }).success).toBe(false);
  });
});
