import { describe, it, expect, beforeEach } from "vitest";
import { POST } from "./route";
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

function makeParams(
  id: string,
  num: string,
): { params: Promise<{ id: string; num: string }> } {
  return { params: Promise.resolve({ id, num }) };
}

// ---------------------------------------------------------------------------
// POST /api/articles/[id]/revisions/[num]/restore
// ---------------------------------------------------------------------------

describe("POST /api/articles/[id]/revisions/[num]/restore", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it("EDITOR restores own article's revision → 201, new revision created, article updated", async () => {
    const editor = await createTestUser({ role: "EDITOR" });
    const token = await createTestSession(editor.id);

    // Create article with revision 1 ("Original")
    const article = await createTestArticle(editor.id, { content: "Original content." });

    // Manually add revision 2 with different content
    await prisma.revision.create({
      data: {
        articleId: article.id,
        title: "Test Article",
        content: "Updated content revision 2.",
        revisionNum: 2,
        createdById: editor.id,
        changeNote: "Second edit",
      },
    });
    // Also update the article to reflect revision 2
    await prisma.article.update({
      where: { id: article.id },
      data: { content: "Updated content revision 2." },
    });

    // Restore to revision 1
    const req = new Request(
      `http://localhost/api/articles/${article.id}/revisions/1/restore`,
      {
        method: "POST",
        headers: bearerHeader(token),
      },
    );
    const res = await POST(req, makeParams(article.id, "1"));
    const body = (await res.json()) as {
      revision: { revisionNum: number; changeNote: string };
    };

    expect(res.status).toBe(201);
    expect(body.revision.revisionNum).toBe(3);
    expect(body.revision.changeNote).toContain("Restored from revision 1");

    // Article should now have original content
    const updatedArticle = await prisma.article.findUnique({
      where: { id: article.id },
      select: { content: true },
    });
    expect(updatedArticle!.content).toBe("Original content.");

    // Should now have 3 revisions total
    const revisionCount = await prisma.revision.count({
      where: { articleId: article.id },
    });
    expect(revisionCount).toBe(3);
  });

  it("EDITOR cannot restore another user's article → 403", async () => {
    const owner = await createTestUser({ role: "EDITOR", email: "owner@test.com", username: "owner" });
    const other = await createTestUser({ role: "EDITOR", email: "other@test.com", username: "other" });
    const otherToken = await createTestSession(other.id);
    const article = await createTestArticle(owner.id);

    const req = new Request(
      `http://localhost/api/articles/${article.id}/revisions/1/restore`,
      {
        method: "POST",
        headers: bearerHeader(otherToken),
      },
    );
    const res = await POST(req, makeParams(article.id, "1"));

    expect(res.status).toBe(403);
  });

  it("ADMIN can restore any article's revision → 201", async () => {
    const editor = await createTestUser({ role: "EDITOR", email: "ed@test.com", username: "ed" });
    const admin = await createTestUser({ role: "ADMIN", email: "admin@test.com", username: "admin" });
    const adminToken = await createTestSession(admin.id);
    const article = await createTestArticle(editor.id, { content: "Editor's content." });

    const req = new Request(
      `http://localhost/api/articles/${article.id}/revisions/1/restore`,
      {
        method: "POST",
        headers: bearerHeader(adminToken),
      },
    );
    const res = await POST(req, makeParams(article.id, "1"));
    const body = (await res.json()) as {
      revision: { revisionNum: number };
    };

    expect(res.status).toBe(201);
    expect(body.revision.revisionNum).toBe(2);
  });

  it("nonexistent revision num returns 404", async () => {
    const editor = await createTestUser({ role: "EDITOR" });
    const token = await createTestSession(editor.id);
    const article = await createTestArticle(editor.id);

    const req = new Request(
      `http://localhost/api/articles/${article.id}/revisions/999/restore`,
      {
        method: "POST",
        headers: bearerHeader(token),
      },
    );
    const res = await POST(req, makeParams(article.id, "999"));

    expect(res.status).toBe(404);
  });
});
