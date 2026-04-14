import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { json, handleError } from "@/lib/response";
import { parseSessionToken, assertRole } from "@/lib/auth";
import { NotFoundError } from "@/lib/errors";

// ---------------------------------------------------------------------------
// GET /api/articles/[id]/revisions/[num]
// ---------------------------------------------------------------------------

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; num: string }> },
): Promise<Response> {
  try {
    const user = await parseSessionToken(request);
    assertRole(user, Role.EDITOR);

    const { id, num } = await params;
    const revisionNum = parseInt(num, 10);
    if (isNaN(revisionNum)) throw new NotFoundError("Revision not found");

    // Accept slug or cuid
    const isCuid = /^c[a-z0-9]{24,}$/.test(id);
    const article = await prisma.article.findFirst({
      where: isCuid ? { id } : { slug: id },
      select: { id: true },
    });
    if (!article) throw new NotFoundError("Article not found");

    const revision = await prisma.revision.findUnique({
      where: { articleId_revisionNum: { articleId: article.id, revisionNum } },
      select: {
        id: true,
        revisionNum: true,
        title: true,
        content: true,
        changeNote: true,
        createdAt: true,
        createdBy: { select: { id: true, username: true } },
      },
    });
    if (!revision) throw new NotFoundError("Revision not found");

    return json({
      id: revision.id,
      revisionNum: revision.revisionNum,
      title: revision.title,
      content: revision.content,
      changeNote: revision.changeNote,
      createdAt: revision.createdAt.toISOString(),
      createdBy: revision.createdBy,
    });
  } catch (err) {
    return handleError(err);
  }
}
