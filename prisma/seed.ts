import { PrismaClient, Role } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function slugify(title: string, id: string): string {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 60);
  return `${base}-${id.slice(-8)}`;
}

function excerpt(content: string): string {
  return content.replace(/[#*`>\-]/g, "").trim().slice(0, 200);
}

// ---------------------------------------------------------------------------
// Seed data
// ---------------------------------------------------------------------------

async function main() {
  console.log("🌱 Seeding database…");

  const COST = 12;

  // ------------------------------------------------------------------
  // Users
  // ------------------------------------------------------------------

  const admin = await prisma.user.upsert({
    where: { email: "admin@wiki.local" },
    update: {},
    create: {
      email: "admin@wiki.local",
      username: "admin",
      passwordHash: await bcrypt.hash("Admin1234!", COST),
      role: Role.ADMIN,
    },
  });

  const editor = await prisma.user.upsert({
    where: { email: "editor@wiki.local" },
    update: {},
    create: {
      email: "editor@wiki.local",
      username: "editor",
      passwordHash: await bcrypt.hash("Editor1234!", COST),
      role: Role.EDITOR,
      createdById: admin.id,
    },
  });

  const viewer = await prisma.user.upsert({
    where: { email: "viewer@wiki.local" },
    update: {},
    create: {
      email: "viewer@wiki.local",
      username: "viewer",
      passwordHash: await bcrypt.hash("Viewer1234!", COST),
      role: Role.VIEWER,
      createdById: admin.id,
    },
  });

  console.log(`  ✓ Users: ${admin.username}, ${editor.username}, ${viewer.username}`);

  // ------------------------------------------------------------------
  // Tags
  // ------------------------------------------------------------------

  const tagNames = ["announcement", "tutorial", "reference", "meta"];
  const tags: Record<string, { id: string; name: string }> = {};

  for (const name of tagNames) {
    const tag = await prisma.tag.upsert({
      where: { name },
      update: {},
      create: { name, createdById: admin.id },
    });
    tags[name] = tag;
  }

  console.log(`  ✓ Tags: ${tagNames.join(", ")}`);

  // ------------------------------------------------------------------
  // Articles
  // ------------------------------------------------------------------

  const articleDefs = [
    {
      title: "Welcome to the Wiki",
      content: `# Welcome to the Wiki

This is the central knowledge base for our team. Here you'll find documentation,
tutorials, and reference material covering everything from development workflows
to deployment procedures.

## Getting Started

1. Browse articles using the search bar at the top of the page.
2. Use the tag system to filter by topic.
3. If you have an EDITOR role, you can create and edit articles.

## Contributing

All edits are versioned — every save creates a new revision so nothing is ever lost.
Editors can view the full revision history and restore any previous version.

> If you notice something missing or outdated, please update it or raise it with an admin.
`,
      tags: ["announcement", "meta"],
      authorId: admin.id,
    },
    {
      title: "Getting Started with PostgreSQL Full-Text Search",
      content: `# Getting Started with PostgreSQL Full-Text Search

PostgreSQL's built-in full-text search uses the \`tsvector\` type and \`tsquery\` operators
to provide fast, relevance-ranked search without an external search engine.

## Key Concepts

- **\`tsvector\`**: A preprocessed representation of a document. Lexemes are stemmed and
  stop words removed.
- **\`tsquery\`**: A parsed query expression with boolean operators (\`&\`, \`|\`, \`!\`).
- **\`ts_rank\`**: Scores a document against a query based on term frequency and position.
- **GIN index**: A Generalized Inverted Index optimised for tsvector columns.

## Example

\`\`\`sql
-- Create a tsvector column and populate it
ALTER TABLE articles ADD COLUMN search_vector tsvector;
UPDATE articles
  SET search_vector = to_tsvector('english', title || ' ' || content);

-- Create a GIN index for fast lookups
CREATE INDEX articles_search_idx ON articles USING GIN(search_vector);

-- Query with prefix matching
SELECT title, ts_rank(search_vector, query) AS rank
FROM articles, to_tsquery('english', 'postgres:*') query
WHERE search_vector @@ query
ORDER BY rank DESC;
\`\`\`

## Trigger-Based Updates

The most reliable way to keep the \`tsvector\` column in sync is a \`BEFORE INSERT OR UPDATE\`
trigger. This wiki uses exactly that pattern — see \`prisma/migrations\` for the SQL.
`,
      tags: ["tutorial", "reference"],
      authorId: editor.id,
    },
    {
      title: "Role-Based Access Control Design",
      content: `# Role-Based Access Control Design

This wiki enforces a three-tier role hierarchy: **VIEWER → EDITOR → ADMIN**.

## Role Capabilities

| Action | VIEWER | EDITOR | ADMIN |
|--------|--------|--------|-------|
| Read published articles | ✓ | ✓ | ✓ |
| Read unpublished articles | own only | own only | ✓ |
| Create articles | — | ✓ | ✓ |
| Edit own articles | — | ✓ | ✓ |
| Edit any article | — | — | ✓ |
| Delete articles | — | — | ✓ |
| View revision history | — | ✓ | ✓ |
| Restore revisions | — | own only | ✓ |
| Manage users | — | — | ✓ |
| Transfer article ownership | — | — | ✓ |

## Implementation Pattern

Role checks happen at the top of every mutating API route handler — **not** in
Next.js middleware — so they remain explicit and independently testable.

\`\`\`typescript
// lib/auth.ts
export function assertRole(user: SessionUser | null, minimum: Role): void {
  if (!user) throw new UnauthorizedError();
  const hierarchy: Role[] = ['VIEWER', 'EDITOR', 'ADMIN'];
  if (hierarchy.indexOf(user.role) < hierarchy.indexOf(minimum)) {
    throw new ForbiddenError();
  }
}
\`\`\`

The ownership check for EDITORs compares \`article.editorId === session.userId\`.
\`createdById\` is audit-only and never used in permission checks.
`,
      tags: ["reference"],
      authorId: editor.id,
    },
    {
      title: "Markdown Editing Guide",
      content: `# Markdown Editing Guide

This wiki renders articles using GitHub-flavoured Markdown. Below is a quick
reference for the supported syntax.

## Headings

\`\`\`
# H1  (used as the article title)
## H2
### H3
\`\`\`

## Emphasis

- \`**bold**\` → **bold**
- \`*italic*\` → *italic*
- \`~~strikethrough~~\` → ~~strikethrough~~

## Lists

Unordered: lines starting with \`-\` or \`*\`
Ordered: lines starting with \`1.\`, \`2.\`, etc.

## Code

Inline: \`backticks\`

Fenced blocks with optional language hint:

\`\`\`typescript
const greet = (name: string) => \`Hello, \${name}!\`;
\`\`\`

## Tables

| Column A | Column B |
|----------|----------|
| Cell 1   | Cell 2   |

## Links and Images

\`[link text](https://example.com)\`
\`![alt text](image-url)\` — note: image uploads are out of scope; use external URLs.

## Tips

- Keep H1 as the first line — it is used as the article title in the editor.
- The live preview pane updates as you type.
- All revisions are stored, so feel free to experiment.
`,
      tags: ["tutorial", "reference"],
      authorId: editor.id,
    },
    {
      title: "Revision History and Diffing",
      content: `# Revision History and Diffing

Every time an article's title or content changes, the wiki automatically creates
a new **Revision** record containing a full snapshot of the previous state.
Tag-only changes do **not** create a new revision.

## How Revisions Work

- Revision numbers start at **1** and are monotonically increasing per article.
- The \`Revision\` table is append-only — rows are never updated or deleted.
- Restoring a revision creates a **new** revision (it does not delete history).

## Viewing Diffs

Navigate to an article's revision history to see the list of saves. Select any
two revisions from the dropdowns to compare them side-by-side. Added lines are
shown in green, removed lines in red.

The diff engine uses the Myers diff algorithm (the \`diff\` npm package) operating
on line-level granularity.

## API

\`\`\`
GET  /api/articles/:id/revisions          # list (no content — large)
GET  /api/articles/:id/revisions/:num     # full snapshot with content
POST /api/articles/:id/revisions/:num/restore  # create new revision from old snapshot
\`\`\`

## Storage Implications

Each revision stores the **full content** of the article. For very large articles
edited frequently, this can grow quickly. A future improvement could store diffs
instead, but full snapshots make restore operations trivially simple and reliable.
`,
      tags: ["reference", "meta"],
      authorId: admin.id,
    },
  ];

  for (const def of articleDefs) {
    const id = `seed${Math.random().toString(36).slice(2, 10)}`;
    const slug = slugify(def.title, id);
    const contentExcerpt = excerpt(def.content);

    const article = await prisma.article.upsert({
      where: { slug },
      update: {},
      create: {
        id,
        slug,
        title: def.title,
        content: def.content,
        excerpt: contentExcerpt,
        createdById: def.authorId,
        editorId: def.authorId,
        tags: {
          create: def.tags.map((tagName) => ({
            tagId: tags[tagName].id,
            createdById: def.authorId,
          })),
        },
      },
    });

    // Create the initial revision (revisionNum = 1)
    await prisma.revision.upsert({
      where: { articleId_revisionNum: { articleId: article.id, revisionNum: 1 } },
      update: {},
      create: {
        articleId: article.id,
        title: def.title,
        content: def.content,
        changeNote: "Initial version",
        revisionNum: 1,
        createdById: def.authorId,
      },
    });

    console.log(`  ✓ Article: "${def.title}" (${def.tags.join(", ")})`);
  }

  console.log("\n✅ Seed complete.");
  console.log("\nTest credentials:");
  console.log("  admin@wiki.local  / Admin1234!  (ADMIN)");
  console.log("  editor@wiki.local / Editor1234! (EDITOR)");
  console.log("  viewer@wiki.local / Viewer1234! (VIEWER)");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
