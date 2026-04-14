import { describe, it, expect, beforeEach } from "vitest";
import { GET } from "./route";
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

function makeParams(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

// ---------------------------------------------------------------------------
// GET /api/articles/[id]/revisions
// ---------------------------------------------------------------------------

describe("GET /api/articles/[id]/revisions", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it("EDITOR sees list of revisions and content field is absent", async () => {
    const editor = await createTestUser({ role: "EDITOR" });
    const token = await createTestSession(editor.id);
    const article = await createTestArticle(editor.id);

    const req = new Request(`http://localhost/api/articles/${article.id}/revisions`, {
      headers: bearerHeader(token),
    });
    const res = await GET(req, makeParams(article.id));
    const body = (await res.json()) as {
      revisions: { id: string; revisionNum: number; content?: string }[];
      pagination: { total: number };
    };

    expect(res.status).toBe(200);
    expect(body.revisions).toHaveLength(1);
    expect(body.revisions[0].revisionNum).toBe(1);
    // content must NOT be in the response
    expect("content" in body.revisions[0]).toBe(false);
    expect(body.pagination.total).toBe(1);
  });

  it("VIEWER cannot access revisions → 403", async () => {
    const editor = await createTestUser({ role: "EDITOR", email: "ed@test.com", username: "ed" });
    const viewer = await createTestUser({ role: "VIEWER", email: "viewer@test.com", username: "viewer" });
    const viewerToken = await createTestSession(viewer.id);
    const article = await createTestArticle(editor.id);

    const req = new Request(`http://localhost/api/articles/${article.id}/revisions`, {
      headers: bearerHeader(viewerToken),
    });
    const res = await GET(req, makeParams(article.id));

    expect(res.status).toBe(403);
  });

  it("unauthenticated request returns 401", async () => {
    const editor = await createTestUser({ role: "EDITOR" });
    const article = await createTestArticle(editor.id);

    const req = new Request(`http://localhost/api/articles/${article.id}/revisions`);
    const res = await GET(req, makeParams(article.id));

    expect(res.status).toBe(401);
  });
});
