import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { json, handleError, validationError } from "@/lib/response";
import { parseSessionToken, assertRole } from "@/lib/auth";
import { slugify, generateSlugSuffix } from "@/lib/slug";
import { CreateArticleSchema, ArticleListQuerySchema } from "@/types/schemas";

// ---------------------------------------------------------------------------
// Shared select shape — never include searchVector
// ---------------------------------------------------------------------------

const articleListSelect = {
  id: true,
  slug: true,
  title: true,
  excerpt: true,
  isPublished: true,
  createdAt: true,
  createdBy: { select: { id: true, username: true } },
  editor: { select: { id: true, username: true } },
  tags: {
    select: { tag: { select: { name: true } } },
  },
  _count: { select: { revisions: true } },
} as const;

function stripMarkdown(text: string): string {
  return text
    .replace(/[#*`>\-]/g, "")
    .trim()
    .slice(0, 200);
}

// ---------------------------------------------------------------------------
// GET /api/articles
// ---------------------------------------------------------------------------

export async function GET(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url);
    const raw = Object.fromEntries(url.searchParams.entries());
    const parsed = ArticleListQuerySchema.safeParse(raw);
    if (!parsed.success) return validationError(parsed.error);

    const { page, limit, tag, author } = parsed.data;

    const user = await parseSessionToken(request);
    const isAdmin = user?.role === Role.ADMIN;

    // Base where clause
    const where: Record<string, unknown> = {
      ...(isAdmin ? {} : { isPublished: true }),
      ...(tag ? { tags: { some: { tag: { name: tag } } } } : {}),
      ...(author ? { createdBy: { username: author } } : {}),
    };

    const [articles, total] = await Promise.all([
      prisma.article.findMany({
        where,
        select: articleListSelect,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.article.count({ where }),
    ]);

    const totalPages = Math.ceil(total / limit);

    return json({
      articles: articles.map((a) => ({
        id: a.id,
        slug: a.slug,
        title: a.title,
        excerpt: a.excerpt,
        isPublished: a.isPublished,
        createdAt: a.createdAt.toISOString(),
        createdBy: a.createdBy,
        editor: a.editor,
        tags: a.tags.map((t) => ({ name: t.tag.name })),
        revisionCount: a._count.revisions,
      })),
      pagination: { page, limit, total, totalPages },
    });
  } catch (err) {
    return handleError(err);
  }
}

// ---------------------------------------------------------------------------
// POST /api/articles
// ---------------------------------------------------------------------------

export async function POST(request: Request): Promise<Response> {
  try {
    const user = await parseSessionToken(request);
    assertRole(user, Role.EDITOR);

    const body: unknown = await request.json();
    const parsed = CreateArticleSchema.safeParse(body);
    if (!parsed.success) return validationError(parsed.error);

    const { title, content, tags, isPublished, changeNote } = parsed.data;

    const slug = slugify(title, generateSlugSuffix());
    const excerpt = stripMarkdown(content);

    const article = await prisma.$transaction(async (tx) => {
      // Upsert tags
      const tagRecords = await Promise.all(
        tags.map((name) =>
          tx.tag.upsert({
            where: { name },
            update: {},
            create: { name, createdById: user!.id },
          }),
        ),
      );

      const created = await tx.article.create({
        data: {
          slug,
          title,
          content,
          excerpt,
          isPublished,
          createdById: user!.id,
          editorId: user!.id,
          revisions: {
            create: {
              title,
              content,
              revisionNum: 1,
              createdById: user!.id,
              changeNote: changeNote ?? "Initial revision",
            },
          },
          tags: {
            create: tagRecords.map((tag) => ({
              tagId: tag.id,
              createdById: user!.id,
            })),
          },
        },
        select: {
          id: true,
          slug: true,
          title: true,
          content: true,
          excerpt: true,
          isPublished: true,
          createdAt: true,
          updatedAt: true,
          createdBy: { select: { id: true, username: true } },
          editor: { select: { id: true, username: true } },
          tags: { select: { tag: { select: { name: true } } } },
          _count: { select: { revisions: true } },
        },
      });

      return created;
    });

    return json(
      {
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
        tags: article.tags.map((t) => ({ name: t.tag.name })),
        revisionCount: article._count.revisions,
      },
      { status: 201 },
    );
  } catch (err) {
    return handleError(err);
  }
}
