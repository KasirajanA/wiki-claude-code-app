import { describe, it, expect, beforeEach } from "vitest";
import { GET, PATCH, DELETE } from "./route";
import {
  truncateAll,
  createTestUser,
  createTestSession,
  bearerHeader,
} from "@/test/db";
import { prisma } from "@/lib/prisma";

// ---------------------------------------------------------------------------
// Helper: createTestArticle
// ---------------------------------------------------------------------------

async function createTestArticle(
  authorId: string,
  overrides?: Partial<{
    title: string;
    content: string;
    isPublished: boolean;
    slug: string;
  }>,
) {
  const { slugify, generateSlugSuffix } = await import("@/lib/slug");
  const title = overrides?.title ?? "Test Article";
  const content = overrides?.content ?? "Test content body.";
  const slug = overrides?.slug ?? slugify(title, generateSlugSuffix());
  return prisma.article.create({
    data: {
      slug,
      title,
      content,
      excerpt: content.slice(0, 200),
      isPublished: overrides?.isPublished ?? true,
      createdById: authorId,
      editorId: authorId,
      revisions: {
        create: {
          title,
          content,
          revisionNum: 1,
          createdById: authorId,
          changeNote: "Initial",
        },
      },
    },
  });
}

// ---------------------------------------------------------------------------
// Helpers for route params
// ---------------------------------------------------------------------------

function makeParams(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

// ---------------------------------------------------------------------------
// GET /api/articles/[id]
// ---------------------------------------------------------------------------

describe("GET /api/articles/[id]", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it("returns article by slug", async () => {
    const editor = await createTestUser({ role: "EDITOR" });
    const article = await createTestArticle(editor.id, { title: "Slug Article" });

    const req = new Request(`http://localhost/api/articles/${article.slug}`);
    const res = await GET(req, makeParams(article.slug));
    const body = (await res.json()) as { id: string; slug: string };

    expect(res.status).toBe(200);
    expect(body.slug).toBe(article.slug);
    expect(body.id).toBe(article.id);
  });

  it("returns article by id (cuid)", async () => {
    const editor = await createTestUser({ role: "EDITOR" });
    const article = await createTestArticle(editor.id);

    const req = new Request(`http://localhost/api/articles/${article.id}`);
    const res = await GET(req, makeParams(article.id));
    const body = (await res.json()) as { id: string };

    expect(res.status).toBe(200);
    expect(body.id).toBe(article.id);
  });

  it("returns 404 for nonexistent article", async () => {
    const req = new Request("http://localhost/api/articles/does-not-exist");
    const res = await GET(req, makeParams("does-not-exist"));
    expect(res.status).toBe(404);
  });

  it("unpublished article is hidden from non-owner (404)", async () => {
    const owner = await createTestUser({ role: "EDITOR", email: "owner@test.com", username: "owner" });
    const other = await createTestUser({ role: "EDITOR", email: "other@test.com", username: "other" });
    const otherToken = await createTestSession(other.id);
    const article = await createTestArticle(owner.id, { isPublished: false });

    const req = new Request(`http://localhost/api/articles/${article.id}`, {
      headers: bearerHeader(otherToken),
    });
    const res = await GET(req, makeParams(article.id));
    expect(res.status).toBe(404);
  });

  it("unpublished article is visible to its editor owner", async () => {
    const owner = await createTestUser({ role: "EDITOR" });
    const token = await createTestSession(owner.id);
    const article = await createTestArticle(owner.id, { isPublished: false });

    const req = new Request(`http://localhost/api/articles/${article.id}`, {
      headers: bearerHeader(token),
    });
    const res = await GET(req, makeParams(article.id));
    const body = (await res.json()) as { isPublished: boolean };

    expect(res.status).toBe(200);
    expect(body.isPublished).toBe(false);
  });

  it("unpublished article is visible to ADMIN", async () => {
    const editor = await createTestUser({ role: "EDITOR", email: "ed@test.com", username: "ed" });
    const admin = await createTestUser({ role: "ADMIN", email: "admin@test.com", username: "admin" });
    const adminToken = await createTestSession(admin.id);
    const article = await createTestArticle(editor.id, { isPublished: false });

    const req = new Request(`http://localhost/api/articles/${article.id}`, {
      headers: bearerHeader(adminToken),
    });
    const res = await GET(req, makeParams(article.id));

    expect(res.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// PATCH /api/articles/[id]
// ---------------------------------------------------------------------------

describe("PATCH /api/articles/[id]", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it("EDITOR patches own article → 200, revision created when content changes", async () => {
    const editor = await createTestUser({ role: "EDITOR" });
    const token = await createTestSession(editor.id);
    const article = await createTestArticle(editor.id);

    const req = new Request(`http://localhost/api/articles/${article.id}`, {
      method: "PATCH",
      headers: { ...bearerHeader(token), "Content-Type": "application/json" },
      body: JSON.stringify({ content: "Updated content here." }),
    });
    const res = await PATCH(req, makeParams(article.id));
    const body = (await res.json()) as { content: string; revisionCount: number };

    expect(res.status).toBe(200);
    expect(body.content).toBe("Updated content here.");
    expect(body.revisionCount).toBe(2); // initial + new revision
  });

  it("tag-only change does NOT create a new revision", async () => {
    const editor = await createTestUser({ role: "EDITOR" });
    const token = await createTestSession(editor.id);
    const article = await createTestArticle(editor.id);

    const req = new Request(`http://localhost/api/articles/${article.id}`, {
      method: "PATCH",
      headers: { ...bearerHeader(token), "Content-Type": "application/json" },
      body: JSON.stringify({ tags: ["newtag"] }),
    });
    const res = await PATCH(req, makeParams(article.id));
    const body = (await res.json()) as { revisionCount: number };

    expect(res.status).toBe(200);
    expect(body.revisionCount).toBe(1); // still 1, no new revision
  });

  it("EDITOR patching another user's article → 403", async () => {
    const owner = await createTestUser({ role: "EDITOR", email: "owner@test.com", username: "owner" });
    const other = await createTestUser({ role: "EDITOR", email: "other@test.com", username: "other" });
    const otherToken = await createTestSession(other.id);
    const article = await createTestArticle(owner.id);

    const req = new Request(`http://localhost/api/articles/${article.id}`, {
      method: "PATCH",
      headers: { ...bearerHeader(otherToken), "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Hijacked Title" }),
    });
    const res = await PATCH(req, makeParams(article.id));

    expect(res.status).toBe(403);
  });

  it("ADMIN can patch any article", async () => {
    const editor = await createTestUser({ role: "EDITOR", email: "ed@test.com", username: "ed" });
    const admin = await createTestUser({ role: "ADMIN", email: "admin@test.com", username: "admin" });
    const adminToken = await createTestSession(admin.id);
    const article = await createTestArticle(editor.id);

    const req = new Request(`http://localhost/api/articles/${article.id}`, {
      method: "PATCH",
      headers: { ...bearerHeader(adminToken), "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Admin Updated Title" }),
    });
    const res = await PATCH(req, makeParams(article.id));
    const body = (await res.json()) as { title: string };

    expect(res.status).toBe(200);
    expect(body.title).toBe("Admin Updated Title");
  });

  it("unauthenticated PATCH returns 401", async () => {
    const editor = await createTestUser({ role: "EDITOR" });
    const article = await createTestArticle(editor.id);

    const req = new Request(`http://localhost/api/articles/${article.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Nope" }),
    });
    const res = await PATCH(req, makeParams(article.id));

    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/articles/[id]
// ---------------------------------------------------------------------------

describe("DELETE /api/articles/[id]", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it("ADMIN deletes article → 200, article gone from DB", async () => {
    const admin = await createTestUser({ role: "ADMIN" });
    const adminToken = await createTestSession(admin.id);
    const article = await createTestArticle(admin.id);

    const req = new Request(`http://localhost/api/articles/${article.id}`, {
      method: "DELETE",
      headers: bearerHeader(adminToken),
    });
    const res = await DELETE(req, makeParams(article.id));
    const body = (await res.json()) as { message: string };

    expect(res.status).toBe(200);
    expect(body.message).toBe("Article deleted");

    const gone = await prisma.article.findUnique({ where: { id: article.id } });
    expect(gone).toBeNull();
  });

  it("EDITOR cannot delete article → 403", async () => {
    const editor = await createTestUser({ role: "EDITOR" });
    const token = await createTestSession(editor.id);
    const article = await createTestArticle(editor.id);

    const req = new Request(`http://localhost/api/articles/${article.id}`, {
      method: "DELETE",
      headers: bearerHeader(token),
    });
    const res = await DELETE(req, makeParams(article.id));

    expect(res.status).toBe(403);
  });

  it("deleting nonexistent article returns 404", async () => {
    const admin = await createTestUser({ role: "ADMIN" });
    const adminToken = await createTestSession(admin.id);

    const req = new Request("http://localhost/api/articles/nonexistent-slug-xyz", {
      method: "DELETE",
      headers: bearerHeader(adminToken),
    });
    const res = await DELETE(req, makeParams("nonexistent-slug-xyz"));

    expect(res.status).toBe(404);
  });
});
