import { prisma } from "@/lib/prisma";
import { BadRequestError } from "@/lib/errors";

export class SearchQueryEmptyError extends BadRequestError {
  constructor() {
    super("Search query cannot be empty");
  }
}

export class SearchQueryTooLongError extends BadRequestError {
  constructor() {
    super("Search query must be 200 characters or fewer");
  }
}

/** Allowed characters after sanitisation — prevents tsquery injection. */
const SAFE_QUERY_RE = /[^a-zA-Z0-9 \-]/g;

/**
 * Converts a raw user search string into a PostgreSQL tsquery expression
 * supporting prefix matching (`:*`) and boolean AND.
 *
 * @example buildTsQuery("hello world") → "hello:* & world:*"
 */
export function buildTsQuery(raw: string): string {
  if (!raw || raw.trim().length === 0) throw new SearchQueryEmptyError();
  if (raw.length > 200) throw new SearchQueryTooLongError();

  const sanitised = raw.replace(SAFE_QUERY_RE, " ").trim();
  const terms = sanitised.split(/\s+/).filter(Boolean);
  if (terms.length === 0) throw new SearchQueryEmptyError();

  return terms.map((t) => `${t}:*`).join(" & ");
}

export type SearchResultRow = {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  rank: number;
  createdAt: Date;
  creatorId: string;
  creatorUsername: string;
};

export type TagRow = { id: string; name: string };

/**
 * Executes a full-text search and returns ranked article rows plus their tags.
 * Uses `prisma.$queryRaw` because tsvector queries cannot be expressed via the Prisma DSL.
 */
export async function searchArticles(params: {
  q: string;
  page: number;
  limit: number;
  tag?: string;
  includeUnpublished?: boolean;
}): Promise<{ results: (SearchResultRow & { tags: TagRow[] })[]; total: number }> {
  const tsQuery = buildTsQuery(params.q);
  const offset = (params.page - 1) * params.limit;

  type RawRow = SearchResultRow & { total: bigint };

  const tagFilter = params.tag ? params.tag.toLowerCase() : null;
  const publishedFilter = params.includeUnpublished ? null : true;

  const rows = await prisma.$queryRaw<RawRow[]>`
    SELECT
      a.id,
      a.slug,
      a.title,
      a.excerpt,
      ts_rank(a."searchVector", to_tsquery('english', ${tsQuery})) AS rank,
      a."createdAt",
      u.id          AS "creatorId",
      u.username    AS "creatorUsername",
      COUNT(*) OVER() AS total
    FROM "Article" a
    JOIN "User" u ON u.id = a."createdById"
    ${tagFilter
      ? prisma.$queryRaw`LEFT JOIN "ArticleTag" at2 ON at2."articleId" = a.id
         LEFT JOIN "Tag" t ON t.id = at2."tagId" AND t.name = ${tagFilter}`
      : prisma.$queryRaw``
    }
    WHERE
      a."searchVector" @@ to_tsquery('english', ${tsQuery})
      ${publishedFilter !== null ? prisma.$queryRaw`AND a."isPublished" = ${publishedFilter}` : prisma.$queryRaw``}
      ${tagFilter ? prisma.$queryRaw`AND t.id IS NOT NULL` : prisma.$queryRaw``}
    ORDER BY rank DESC
    LIMIT ${params.limit} OFFSET ${offset}
  `;

  if (rows.length === 0) return { results: [], total: 0 };

  const total = Number(rows[0].total);
  const ids = rows.map((r) => r.id);

  // Fetch tags for the result set in one query
  const tagRows = await prisma.articleTag.findMany({
    where: { articleId: { in: ids } },
    include: { tag: { select: { id: true, name: true } } },
  });

  const tagsByArticle = new Map<string, TagRow[]>();
  for (const at of tagRows) {
    const list = tagsByArticle.get(at.articleId) ?? [];
    list.push(at.tag);
    tagsByArticle.set(at.articleId, list);
  }

  const results = rows.map((r) => ({
    ...r,
    rank: Number(r.rank),
    tags: tagsByArticle.get(r.id) ?? [],
  }));

  return { results, total };
}
