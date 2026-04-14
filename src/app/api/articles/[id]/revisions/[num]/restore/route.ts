import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { json, handleError } from "@/lib/response";
import { parseSessionToken, assertRole } from "@/lib/auth";
import { NotFoundError, ForbiddenError } from "@/lib/errors";

function stripMarkdown(text: string): string {
  return text
    .replace(/[#*`>\-]/g, "")
    .trim()
    .slice(0, 200);
}

// ---------------------------------------------------------------------------
// POST /api/articles/[id]/revisions/[num]/restore
// ---------------------------------------------------------------------------

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; num: string }> },
): Promise<Response> {
  try {
    const sessionUser = await parseSessionToken(request);
    assertRole(sessionUser, Role.EDITOR);
    // assertRole throws if null, so user is non-null beyond this point
    const user = sessionUser!;

    const { id, num } = await params;
    const revisionNum = parseInt(num, 10);
    if (isNaN(revisionNum)) throw new NotFoundError("Revision not found");

    // Accept slug or cuid
    const isCuid = /^c[a-z0-9]{24,}$/.test(id);
    const article = await prisma.article.findFirst({
      where: isCuid ? { id } : { slug: id },
      select: { id: true, editorId: true },
    });
    if (!article) throw new NotFoundError("Article not found");

    // Ownership check for non-admins
    if (user.role === Role.EDITOR && article.editorId !== user.id) {
      throw new ForbiddenError("You do not own this article");
    }

    const targetRevision = await prisma.revision.findUnique({
      where: {
        articleId_revisionNum: { articleId: article.id, revisionNum },
      },
      select: { title: true, content: true },
    });
    if (!targetRevision) throw new NotFoundError("Revision not found");

    const result = await prisma.$transaction(async (tx) => {
      // Find current max revision num
      const maxRevision = await tx.revision.findFirst({
        where: { articleId: article.id },
        orderBy: { revisionNum: "desc" },
        select: { revisionNum: true },
      });
      const nextRevNum = (maxRevision?.revisionNum ?? 0) + 1;

      // Create new revision with old snapshot
      const newRevision = await tx.revision.create({
        data: {
          articleId: article.id,
          title: targetRevision.title,
          content: targetRevision.content,
          revisionNum: nextRevNum,
          createdById: user.id,
          changeNote: `Restored from revision ${revisionNum}`,
        },
        select: {
          id: true,
          revisionNum: true,
          title: true,
          changeNote: true,
          createdAt: true,
        },
      });

      // Update article with restored content
      await tx.article.update({
        where: { id: article.id },
        data: {
          title: targetRevision.title,
          content: targetRevision.content,
          excerpt: stripMarkdown(targetRevision.content),
          updatedById: user.id,
        },
      });

      return newRevision;
    });

    return json(
      {
        revision: {
          id: result.id,
          revisionNum: result.revisionNum,
          title: result.title,
          changeNote: result.changeNote,
          createdAt: result.createdAt.toISOString(),
        },
      },
      { status: 201 },
    );
  } catch (err) {
    return handleError(err);
  }
}
