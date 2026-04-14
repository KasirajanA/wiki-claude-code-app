import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { json, handleError } from "@/lib/response";
import { parseSessionToken, assertRole } from "@/lib/auth";
import { PaginationSchema } from "@/types/schemas";
import { NotFoundError } from "@/lib/errors";

// ---------------------------------------------------------------------------
// GET /api/articles/[id]/revisions
// ---------------------------------------------------------------------------

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const user = await parseSessionToken(request);
    assertRole(user, Role.EDITOR);

    const { id } = await params;

    // Accept slug or cuid
    const isCuid = /^c[a-z0-9]{24,}$/.test(id);
    const article = await prisma.article.findFirst({
      where: isCuid ? { id } : { slug: id },
      select: { id: true },
    });
    if (!article) throw new NotFoundError("Article not found");

    const url = new URL(request.url);
    const raw = Object.fromEntries(url.searchParams.entries());
    const parsed = PaginationSchema.safeParse(raw);
    const { page, limit } = parsed.success ? parsed.data : { page: 1, limit: 20 };

    const [revisions, total] = await Promise.all([
      prisma.revision.findMany({
        where: { articleId: article.id },
        // Explicitly omit `content`
        select: {
          id: true,
          revisionNum: true,
          title: true,
          changeNote: true,
          createdAt: true,
          createdBy: { select: { id: true, username: true } },
        },
        orderBy: { revisionNum: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.revision.count({ where: { articleId: article.id } }),
    ]);

    const totalPages = Math.ceil(total / limit);

    return json({
      revisions: revisions.map((r) => ({
        id: r.id,
        revisionNum: r.revisionNum,
        title: r.title,
        changeNote: r.changeNote,
        createdAt: r.createdAt.toISOString(),
        createdBy: r.createdBy,
      })),
      pagination: { page, limit, total, totalPages },
    });
  } catch (err) {
    return handleError(err);
  }
}
