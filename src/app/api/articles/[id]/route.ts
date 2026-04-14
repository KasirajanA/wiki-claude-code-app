import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { json, handleError, validationError } from "@/lib/response";
import { parseSessionToken, assertRole } from "@/lib/auth";
import { UpdateArticleSchema } from "@/types/schemas";
import { NotFoundError, ForbiddenError } from "@/lib/errors";

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

const articleDetailSelect = {
  id: true,
  slug: true,
  title: true,
  content: true,
  excerpt: true,
  isPublished: true,
  createdAt: true,
  updatedAt: true,
  createdById: true,
  editorId: true,
  createdBy: { select: { id: true, username: true } },
  editor: { select: { id: true, username: true } },
  updatedBy: { select: { id: true, username: true } },
  tags: { select: { tag: { select: { name: true } } } },
  _count: { select: { revisions: true } },
} as const;

function formatArticle(article: {
  id: string;
  slug: string;
  title: string;
  content: string;
  excerpt: string;
  isPublished: boolean;
  createdAt: Date;
  updatedAt: Date;
  createdById: string;
  editorId: string;
  createdBy: { id: string; username: string };
  editor: { id: string; username: string };
  updatedBy: { id: string; username: string } | null;
  tags: { tag: { name: string } }[];
  _count: { revisions: number };
}) {
  return {
    id: article.id,
    slug: article.slug,
    title: article.title,
    content: article.content,
    excerpt: article.excerpt,
    isPublished: article.isPublished,
    createdAt: article.createdAt.toISOString(),
    updatedAt: article.updatedAt.toISOString(),
    createdBy: article.createdBy,
    editor: article.editor,
    updatedBy: article.updatedBy,
    tags: article.tags.map((t) => ({ name: t.tag.name })),
    revisionCount: article._count.revisions,
  };
}

async function findArticle(idOrSlug: string) {
  // Try cuid first (cuid starts with 'c'), otherwise treat as slug
  const isCuid = /^c[a-z0-9]{24,}$/.test(idOrSlug);
  const article = await prisma.article.findFirst({
    where: isCuid ? { id: idOrSlug } : { slug: idOrSlug },
    select: articleDetailSelect,
  });
  return article;
}

function stripMarkdown(text: string): string {
  return text
    .replace(/[#*`>\-]/g, "")
    .trim()
    .slice(0, 200);
}

// ---------------------------------------------------------------------------
// GET /api/articles/[id]
// ---------------------------------------------------------------------------

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = await params;
    const article = await findArticle(id);

    if (!article) throw new NotFoundError("Article not found");

    if (!article.isPublished) {
      const user = await parseSessionToken(request);
      const isOwner = user?.id === article.editorId;
      const isAdmin = user?.role === Role.ADMIN;
      if (!isOwner && !isAdmin) throw new NotFoundError("Article not found");
    }

    return json(formatArticle(article));
  } catch (err) {
    return handleError(err);
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/articles/[id]
// ---------------------------------------------------------------------------

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const user = await parseSessionToken(request);
    assertRole(user, Role.EDITOR);

    const { id } = await params;
    const article = await findArticle(id);
    if (!article) throw new NotFoundError("Article not found");

    // Ownership check for non-admins
    if (user!.role === Role.EDITOR && article.editorId !== user!.id) {
      throw new ForbiddenError("You do not own this article");
    }

    const body: unknown = await request.json();
    const parsed = UpdateArticleSchema.safeParse(body);
    if (!parsed.success) return validationError(parsed.error);

    const { title, content, tags, isPublished, changeNote } = parsed.data;

    const contentChanged = !!(title || content);
    const newTitle = title ?? article.title;
    const newContent = content ?? article.content;

    const updated = await prisma.$transaction(async (tx) => {
      // Handle tags if provided
      if (tags !== undefined) {
        // Remove all existing tags for this article
        await tx.articleTag.deleteMany({ where: { articleId: article.id } });

        // Upsert new tags and recreate ArticleTags
        const tagRecords = await Promise.all(
          tags.map((name) =>
            tx.tag.upsert({
              where: { name },
              update: {},
              create: { name, createdById: user!.id },
            }),
          ),
        );

        await tx.articleTag.createMany({
          data: tagRecords.map((tag) => ({
            articleId: article.id,
            tagId: tag.id,
            createdById: user!.id,
          })),
        });
      }

      // Create a revision only if title or content changed
      if (contentChanged) {
        const maxRevision = await tx.revision.findFirst({
          where: { articleId: article.id },
          orderBy: { revisionNum: "desc" },
          select: { revisionNum: true },
        });
        const nextRevNum = (maxRevision?.revisionNum ?? 0) + 1;

        await tx.revision.create({
          data: {
            articleId: article.id,
            title: newTitle,
            content: newContent,
            revisionNum: nextRevNum,
            createdById: user!.id,
            changeNote: changeNote,
          },
        });
      }

      const newExcerpt = content ? stripMarkdown(newContent) : article.excerpt;

      return tx.article.update({
        where: { id: article.id },
        data: {
          title: title,
          content: content,
          excerpt: content ? newExcerpt : undefined,
          isPublished: isPublished,
          updatedById: user!.id,
        },
        select: articleDetailSelect,
      });
    });

    return json(formatArticle(updated));
  } catch (err) {
    return handleError(err);
  }
}

// ---------------------------------------------------------------------------
// DELETE /api/articles/[id]
// ---------------------------------------------------------------------------

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const user = await parseSessionToken(request);
    assertRole(user, Role.ADMIN);

    const { id } = await params;
    const article = await findArticle(id);
    if (!article) throw new NotFoundError("Article not found");

    await prisma.article.delete({ where: { id: article.id } });

    return json({ message: "Article deleted" });
  } catch (err) {
    return handleError(err);
  }
}
