import { describe, it, expect, beforeEach } from "vitest";
import { GET, POST } from "./route";
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
// GET /api/articles
// ---------------------------------------------------------------------------

describe("GET /api/articles", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it("lists published articles (no auth)", async () => {
    const user = await createTestUser({ role: "EDITOR" });
    await createTestArticle(user.id, { title: "Published Article", isPublished: true });

    const req = new Request("http://localhost/api/articles");
    const res = await GET(req);
    const body = (await res.json()) as {
      articles: { isPublished: boolean }[];
      pagination: { total: number };
    };

    expect(res.status).toBe(200);
    expect(body.articles).toHaveLength(1);
    expect(body.articles[0].isPublished).toBe(true);
    expect(body.pagination.total).toBe(1);
  });

  it("excludes unpublished articles for unauthenticated users", async () => {
    const user = await createTestUser({ role: "EDITOR" });
    await createTestArticle(user.id, { isPublished: false });
    await createTestArticle(user.id, {
      title: "Published",
      slug: "published-abc1",
      isPublished: true,
    });

    const req = new Request("http://localhost/api/articles");
    const res = await GET(req);
    const body = (await res.json()) as { articles: { isPublished: boolean }[] };

    expect(res.status).toBe(200);
    expect(body.articles).toHaveLength(1);
    expect(body.articles[0].isPublished).toBe(true);
  });

  it("ADMIN sees unpublished articles too", async () => {
    const admin = await createTestUser({ role: "ADMIN", email: "admin@test.com", username: "admin" });
    const token = await createTestSession(admin.id);
    await createTestArticle(admin.id, { isPublished: false });
    await createTestArticle(admin.id, {
      title: "Published",
      slug: "published-abc2",
      isPublished: true,
    });

    const req = new Request("http://localhost/api/articles", {
      headers: bearerHeader(token),
    });
    const res = await GET(req);
    const body = (await res.json()) as { articles: { isPublished: boolean }[] };

    expect(res.status).toBe(200);
    expect(body.articles).toHaveLength(2);
  });

  it("filters articles by tag", async () => {
    const editor = await createTestUser({ role: "EDITOR" });
    const tag = await prisma.tag.create({ data: { name: "typescript", createdById: editor.id } });
    const article = await createTestArticle(editor.id, { title: "Tagged Article" });
    // Associate tag
    await prisma.articleTag.create({
      data: { articleId: article.id, tagId: tag.id, createdById: editor.id },
    });
    await createTestArticle(editor.id, { title: "Untagged Article", slug: "untagged-abc3" });

    const req = new Request("http://localhost/api/articles?tag=typescript");
    const res = await GET(req);
    const body = (await res.json()) as { articles: { title: string }[] };

    expect(res.status).toBe(200);
    expect(body.articles).toHaveLength(1);
    expect(body.articles[0].title).toBe("Tagged Article");
  });

  it("filters articles by author username", async () => {
    const alice = await createTestUser({ email: "alice@test.com", username: "alice", role: "EDITOR" });
    const bob = await createTestUser({ email: "bob@test.com", username: "bob", role: "EDITOR" });
    await createTestArticle(alice.id, { title: "Alice Article" });
    await createTestArticle(bob.id, { title: "Bob Article", slug: "bob-article-xyz" });

    const req = new Request("http://localhost/api/articles?author=alice");
    const res = await GET(req);
    const body = (await res.json()) as { articles: { title: string }[] };

    expect(res.status).toBe(200);
    expect(body.articles).toHaveLength(1);
    expect(body.articles[0].title).toBe("Alice Article");
  });

  it("pagination works (limit=1 returns 1 result + correct totalPages)", async () => {
    const user = await createTestUser({ role: "EDITOR" });
    await createTestArticle(user.id, { title: "Article One" });
    await createTestArticle(user.id, { title: "Article Two", slug: "article-two-xyz" });

    const req = new Request("http://localhost/api/articles?limit=1&page=1");
    const res = await GET(req);
    const body = (await res.json()) as {
      articles: unknown[];
      pagination: { page: number; limit: number; total: number; totalPages: number };
    };

    expect(res.status).toBe(200);
    expect(body.articles).toHaveLength(1);
    expect(body.pagination.total).toBe(2);
    expect(body.pagination.totalPages).toBe(2);
    expect(body.pagination.limit).toBe(1);
    expect(body.pagination.page).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// POST /api/articles
// ---------------------------------------------------------------------------

describe("POST /api/articles", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it("EDITOR creates article → 201, slug generated, revision 1 created", async () => {
    const editor = await createTestUser({ role: "EDITOR" });
    const token = await createTestSession(editor.id);

    const req = new Request("http://localhost/api/articles", {
      method: "POST",
      headers: { ...bearerHeader(token), "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "My New Article",
        content: "Some content here.",
        isPublished: true,
      }),
    });

    const res = await POST(req);
    const body = (await res.json()) as {
      id: string;
      slug: string;
      revisionCount: number;
    };

    expect(res.status).toBe(201);
    expect(body.slug).toMatch(/^my-new-article-/);
    expect(body.revisionCount).toBe(1);

    const revision = await prisma.revision.findFirst({ where: { articleId: body.id } });
    expect(revision).not.toBeNull();
    expect(revision!.revisionNum).toBe(1);
  });

  it("tags are created and associated with the article", async () => {
    const editor = await createTestUser({ role: "EDITOR" });
    const token = await createTestSession(editor.id);

    const req = new Request("http://localhost/api/articles", {
      method: "POST",
      headers: { ...bearerHeader(token), "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "Tagged Article",
        content: "Content with tags.",
        tags: ["typescript", "nextjs"],
      }),
    });

    const res = await POST(req);
    const body = (await res.json()) as {
      id: string;
      tags: { name: string }[];
    };

    expect(res.status).toBe(201);
    expect(body.tags).toHaveLength(2);
    expect(body.tags.map((t) => t.name).sort()).toEqual(["nextjs", "typescript"]);

    const articleTags = await prisma.articleTag.findMany({ where: { articleId: body.id } });
    expect(articleTags).toHaveLength(2);
  });

  it("VIEWER cannot create article → 403", async () => {
    const viewer = await createTestUser({ role: "VIEWER" });
    const token = await createTestSession(viewer.id);

    const req = new Request("http://localhost/api/articles", {
      method: "POST",
      headers: { ...bearerHeader(token), "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Test", content: "Test content." }),
    });

    const res = await POST(req);
    expect(res.status).toBe(403);
  });

  it("unauthenticated request returns 401", async () => {
    const req = new Request("http://localhost/api/articles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Test", content: "Test content." }),
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("invalid body returns 400", async () => {
    const editor = await createTestUser({ role: "EDITOR" });
    const token = await createTestSession(editor.id);

    const req = new Request("http://localhost/api/articles", {
      method: "POST",
      headers: { ...bearerHeader(token), "Content-Type": "application/json" },
      body: JSON.stringify({ title: "" }), // empty title and no content
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});
