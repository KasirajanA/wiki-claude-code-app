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

function makeParams(id: string, num: string): { params: Promise<{ id: string; num: string }> } {
  return { params: Promise.resolve({ id, num }) };
}

// ---------------------------------------------------------------------------
// GET /api/articles/[id]/revisions/[num]
// ---------------------------------------------------------------------------

describe("GET /api/articles/[id]/revisions/[num]", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it("EDITOR gets full revision snapshot including content", async () => {
    const editor = await createTestUser({ role: "EDITOR" });
    const token = await createTestSession(editor.id);
    const article = await createTestArticle(editor.id, { content: "Original content here." });

    const req = new Request(
      `http://localhost/api/articles/${article.id}/revisions/1`,
      { headers: bearerHeader(token) },
    );
    const res = await GET(req, makeParams(article.id, "1"));
    const body = (await res.json()) as {
      revisionNum: number;
      content: string;
      title: string;
    };

    expect(res.status).toBe(200);
    expect(body.revisionNum).toBe(1);
    expect(body.content).toBe("Original content here.");
    expect(typeof body.title).toBe("string");
  });

  it("nonexistent revision num returns 404", async () => {
    const editor = await createTestUser({ role: "EDITOR" });
    const token = await createTestSession(editor.id);
    const article = await createTestArticle(editor.id);

    const req = new Request(
      `http://localhost/api/articles/${article.id}/revisions/999`,
      { headers: bearerHeader(token) },
    );
    const res = await GET(req, makeParams(article.id, "999"));

    expect(res.status).toBe(404);
  });
});
