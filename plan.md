# Wiki Application — Implementation Plan

## Context

Building a full-featured wiki from a blank Next.js 15 + TypeScript + Prisma + PostgreSQL + Tailwind project. The application needs full-text search (PostgreSQL tsvector), markdown editing with live preview, append-only revision history with diffing, role-based permissions (VIEWER / EDITOR / ADMIN), and a Filesystem MCP integration for importing local markdown files. Only `package.json` and `CLAUDE.md` exist today — everything must be scaffolded.

---

## 1. Data Model

### Tables & Key Fields

All tables carry standard audit columns. The pattern for each table is noted inline.

**`User`**
- `id` (cuid), `email` (unique), `username` (unique), `passwordHash`, `role: Role` (default VIEWER)
- `createdAt DateTime @default(now())`
- `createdById String?` → `User` (self-referential, nullable — null for self-registration; set to admin id when an ADMIN creates the account)
- `updatedAt DateTime @updatedAt`
- `updatedById String?` → `User` (nullable — the ADMIN who last changed role or profile; null until first admin edit)

**`Role` enum** — `VIEWER | EDITOR | ADMIN`

**`Article`**
- `id`, `slug` (unique, kebab + cuid suffix), `title`, `content` (markdown), `excerpt` (first 200 chars), `isPublished` (default true), `searchVector` (`Unsupported("tsvector")`)
- `createdAt DateTime @default(now())`
- `createdById String` → `User` (the original author; immutable — never changes, even after ownership transfer)
- `editorId String` → `User` (current owner of the article; defaults to `createdById` at creation; ADMIN can reassign to transfer ownership to another user)
- `updatedAt DateTime @updatedAt`
- `updatedById String?` → `User` (nullable — last user to edit title/content/tags; null until first edit after creation)

> **Ownership transfer:** `editorId` is the field that drives edit-permission checks for EDITOR-role users (`article.editorId === session.userId`). `createdById` is audit-only and never used in permission checks. When an ADMIN transfers ownership, only `editorId` (and `updatedById`) change.

**`Revision`** (append-only, never updated — no `updatedAt`/`updatedById`)
- `id`, `articleId → Article` (Cascade), `title` (snapshot), `content` (snapshot), `changeNote?`, `revisionNum` (monotonic per article)
- `createdAt DateTime @default(now())`
- `createdById String` → `User` (the user who saved this revision)
- Unique on `[articleId, revisionNum]`

**`Tag`**
- `id`, `name` (unique, lowercase-normalized)
- `createdAt DateTime @default(now())`
- `createdById String` → `User`
- `updatedAt DateTime @updatedAt`
- `updatedById String?` → `User` (nullable — set when an ADMIN renames a tag)

**`ArticleTag`** (join — records are inserted or deleted, never updated; only `createdAt`/`createdById`)
- Composite PK `[articleId, tagId]`
- `createdAt DateTime @default(now())`
- `createdById String` → `User` (user who assigned the tag)

**`Session`** (system-managed lifecycle — only `createdAt` needed)
- `id`, `userId → User` (Cascade), `token` (unique cuid), `expiresAt`
- `createdAt DateTime @default(now())`

> **Prisma tip:** `updatedAt DateTime @updatedAt` is handled automatically by Prisma on every `update`. The `updatedById` must be set explicitly in the application layer — pass `session.userId` as `updatedById` in every `prisma.article.update(...)` call.

### PostgreSQL Full-Text Search

Add to the migration file that creates `Article` (cannot be expressed in Prisma DSL alone):

```sql
ALTER TABLE "Article" ADD COLUMN "searchVector" tsvector;
UPDATE "Article" SET "searchVector" = to_tsvector('english', coalesce(title,'') || ' ' || coalesce(content,''));
CREATE OR REPLACE FUNCTION article_search_vector_update() RETURNS trigger AS $$
BEGIN
  NEW."searchVector" := to_tsvector('english', coalesce(NEW.title,'') || ' ' || coalesce(NEW.content,''));
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER article_search_vector_trigger
  BEFORE INSERT OR UPDATE OF title, content ON "Article"
  FOR EACH ROW EXECUTE FUNCTION article_search_vector_update();
CREATE INDEX articles_search_idx ON "Article" USING GIN ("searchVector");
```

### Seed (`prisma/seed.ts`)
One ADMIN (`admin@wiki.local`), one EDITOR (`editor@wiki.local`), five sample articles, tags: `announcement`, `tutorial`, `reference`, `meta`.

---

## 2. API Design

All handlers follow this sequence: `parseSessionToken → assertRole → Schema.safeParse → prisma query → typed response`. Auth check before validation (never leak schema to unauthenticated callers).

### Auth — `src/app/api/auth/`

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| POST | `/api/auth/register` | none | Creates VIEWER; returns `{ token, user }` |
| POST | `/api/auth/login` | none | bcrypt.compare; returns `{ token, user }`; 401 on bad creds |
| POST | `/api/auth/logout` | Bearer | Deletes Session row |
| GET  | `/api/auth/me` | Bearer | Returns `{ id, email, username, role }` |

### Articles — `src/app/api/articles/`

| Method | Path | Min Role | Notes |
|--------|------|----------|-------|
| GET | `/api/articles` | none | Paginated; query params: `page`, `limit`, `tag`, `author` |
| POST | `/api/articles` | EDITOR | Creates Article + Revision(1) + Tags; generates slug |
| GET | `/api/articles/:id` | none | `:id` accepts cuid or slug; 404 on unpublished for non-owners |
| PATCH | `/api/articles/:id` | EDITOR (own) / ADMIN (any) | Creates new Revision only if title/content changed; always sets `updatedById = session.userId` |
| DELETE | `/api/articles/:id` | ADMIN | Hard delete; cascades Revisions and ArticleTags |

### Revisions — `src/app/api/articles/[id]/revisions/`

| Method | Path | Min Role | Notes |
|--------|------|----------|-------|
| GET | `/api/articles/:id/revisions` | EDITOR | List (no content field — too large) |
| GET | `/api/articles/:id/revisions/:num` | EDITOR | Full snapshot with content |
| POST | `/api/articles/:id/revisions/:num/restore` | EDITOR (own) / ADMIN | Creates new Revision copying old content; does NOT delete history |

### Search

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| GET | `/api/search?q=...` | none | Params: `q` (required, max 200), `page`, `limit`, `tag`; uses `prisma.$queryRaw` with `ts_rank`; supports prefix matching via `:*` operator |

Response: `{ results: [{ id, slug, title, excerpt, createdBy: { id, username }, tags, rank, createdAt }], pagination, query }`

### Tags

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| GET | `/api/tags` | none | Returns `{ tags: [{ id, name, articleCount }] }` ordered by count desc |
| GET | `/api/tags/:name/articles` | none | Paginated articles for a tag |
| DELETE | `/api/tags/:name` | ADMIN | Cascades ArticleTag rows |

### Admin

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| GET | `/api/admin/users` | ADMIN | Paginated; search by username/email |
| PATCH | `/api/admin/users/:id/role` | ADMIN | Guard: no self-demotion, no demoting last ADMIN; sets `updatedById = session.userId` on the target User |
| DELETE | `/api/admin/users/:id` | ADMIN | 409 if user has articles (require manual reassignment) |
| PATCH | `/api/admin/articles/:id/owner` | ADMIN | Body: `{ editorId: string }` — transfers article ownership; sets `editorId` to new owner, `updatedById = session.userId`; target user must exist and be EDITOR or ADMIN |

### MCP Import

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| POST | `/api/import` | EDITOR | Body: `{ filePath, tags?, isPublished? }`; reads file via MCP, extracts H1 as title, then follows `POST /api/articles` logic |

---

## 3. Frontend Components

Convention: Server Component (SC) by default. Add `"use client"` only when browser APIs / interactivity are required.

### Layout
- `src/components/layout/nav-bar.tsx` — **SC** — props: `user: SessionUser | null`
- `src/components/layout/search-trigger.tsx` — **CC** — keyboard handler pushes `?q=` to router

### Article Pages
- `src/app/articles/page.tsx` — **SC** — fetches article list server-side
- `src/app/articles/[slug]/page.tsx` — **SC** — fetches article server-side
- `src/app/articles/new/page.tsx` — **SC** shell wrapping `ArticleEditor`
- `src/app/articles/[slug]/edit/page.tsx` — **SC** shell wrapping `ArticleEditor`

### Article Components
- `src/components/articles/article-list.tsx` — **SC** — props: `{ articles: ArticleSummary[], pagination: PaginationMeta }`
- `src/components/articles/article-card.tsx` — **SC** — props: `{ article: ArticleSummary, showAuthor?: boolean }`
- `src/components/articles/article-body.tsx` — **SC** — props: `{ content: string }` — uses `remark` + `rehype-sanitize` + `rehype-highlight` server-side → `dangerouslySetInnerHTML` (safe, sanitized)

### Editor Components (all CC)
- `src/components/editor/article-editor.tsx` — **CC** — props: `{ initialTitle?, initialContent?, initialTags?, isPublished?, onSave: (data) => Promise<void>, isSaving: boolean }` — split pane: textarea left, live preview right
- `src/components/editor/tag-input.tsx` — **CC** — props: `{ value: string[], onChange, suggestions?: string[] }` — typeahead chips
- `src/components/editor/markdown-preview.tsx` — **CC** — props: `{ content: string }` — uses `marked` (not `remark`) to keep `remark` out of the browser bundle

### Search Components
- `src/components/search/search-bar.tsx` — **CC** — props: `{ initialQuery?: string }` — 300ms debounce, updates `?q=` param
- `src/components/search/search-results.tsx` — **SC** — props: `{ results: SearchResult[], query: string, pagination: PaginationMeta }` — `<mark>` highlights query terms

### Revision Components
- `src/components/revision/revision-list.tsx` — **SC** — props: `{ revisions: RevisionSummary[], articleSlug: string, pagination: PaginationMeta, currentUserRole: Role }`
- `src/components/revision/diff-viewer.tsx` — **CC** — props: `{ fromContent, toContent, fromRevisionNum, toRevisionNum }` — uses `diff` npm package; user selects revisions to compare via dropdowns
- `src/components/revision/restore-button.tsx` — **CC** — props: `{ articleId, revisionNum, onRestored: () => void }`

### Auth & Admin Components
- `src/components/auth/login-form.tsx` — **CC** — React Hook Form + Zod resolver; on success stores token cookie, redirects to `/articles`
- `src/components/auth/register-form.tsx` — **CC** — same pattern
- `src/components/admin/user-table.tsx` — **CC** — props: `{ users: AdminUser[], pagination: PaginationMeta, currentUserId: string }` — role dropdown with optimistic update + rollback

### UI Primitives (`src/components/ui/`)
`pagination.tsx` (SC), `badge.tsx` (SC), `error-message.tsx` (SC), `loading-spinner.tsx` (CC), `confirm-dialog.tsx` (CC)

> Mutation strategy: Client components call API route handlers directly via `fetch`. No Server Actions. Rationale: API routes must exist for MCP import anyway — two code paths for the same mutation creates maintenance overhead.

---

## 4. Testing Strategy

### Unit Tests (Vitest — no database)

**`src/lib/search.ts`** — `buildTsQuery`:
- `'hello world'` → `'hello & world'`
- whitespace collapse, single-quote stripping
- empty string throws `SearchQueryEmptyError`
- >200 chars throws `SearchQueryTooLongError`

**`src/types/schemas.ts`** (Zod) — invalid emails, short passwords, >10 tags, unknown role values

**`src/lib/auth.ts`** — `assertRole`: correct hierarchy enforcement, `null` user throws `UnauthorizedError`, VIEWER throws `ForbiddenError` for EDITOR-required routes

**`src/lib/slug.ts`** — `slugify`: casing, special chars, multiple spaces, unicode deburr

**`src/lib/diff.ts`** — identical strings → zero hunks, single-line change → one hunk

### Integration Tests (Vitest + real PostgreSQL test DB)

Each test file wraps tests in a Prisma `$transaction` that rolls back for isolation.

Key cases by area:
- **Articles**: POST creates revision(1); PATCH by different EDITOR returns 403; PATCH with tag-only change does NOT create revision; DELETE cascades revisions
- **Revisions**: revisionNum is monotonically increasing; restore creates new revision (does not delete); content snapshot matches exactly
- **Search**: word match returns correct articles; prefix match with `:*` works; tag filter applied; empty `q` returns 400; unauthenticated excludes unpublished
- **Auth**: wrong password → 401; duplicate email → 409; logout invalidates token (subsequent request → 401)
- **Admin**: last-ADMIN demotion guard; self-demotion guard; EDITOR calling admin route → 403

### E2E Tests (Playwright — seeded test DB)

1. **Create and view article**: log in as EDITOR → `/articles/new` → fill form → save → assert redirect and content visible
2. **Full-text search**: search for seeded word → assert result → click → correct article
3. **Revision history**: edit article → save → view revisions → assert two rows → view diff → assert add/remove lines
4. **Admin role change**: ADMIN promotes VIEWER to EDITOR → log in as that user → assert `/articles/new` accessible
5. **Unauthenticated guard**: navigate to `/articles/new` without session → assert redirect to `/login`

CI runs unit + integration on every push; E2E runs on PRs to `main`.

---

## 5. Security Considerations

### Auth
- Passwords: `bcrypt` cost factor 12
- Sessions: server-side in `Session` table (not JWT) — immediately invalidatable on logout
- Token: transmitted as `HttpOnly; Secure; SameSite=Lax` cookie **and** accepted as `Authorization: Bearer` header for MCP/API clients
- Session expiry: 7 days sliding window; stale sessions cleaned up lazily on login

### Input Validation
Every mutating handler in order: `parseSessionToken → assertRole → Schema.safeParse → prisma`. Auth before validation so schema is never exposed to unauthenticated callers.

### SQL Injection
- All Prisma queries use parameterized inputs by default
- Only raw SQL is in `lib/search.ts` via `prisma.$queryRaw` with tagged template literals (Prisma auto-parameterizes interpolations)
- Defense-in-depth: sanitize search query to `[a-zA-Z0-9 \-]` before passing to `to_tsquery`

### XSS
Markdown rendered server-side via `rehype-sanitize` with a strict allowlist (no `<script>`, no event attributes, no `<iframe>`).

### CORS
No CORS headers — API is same-origin only. MCP import is server-to-server (no browser). Explicitly deferred to future scope.

### CSRF
Mitigated by `SameSite=Lax` on session cookie.

### Role Enforcement Pattern (`src/lib/auth.ts`)
```typescript
export function assertRole(user: SessionUser | null, minimum: Role): void {
  if (!user) throw new UnauthorizedError()
  const hierarchy: Role[] = ['VIEWER', 'EDITOR', 'ADMIN']
  if (hierarchy.indexOf(user.role) < hierarchy.indexOf(minimum)) throw new ForbiddenError()
}
// Ownership check in PATCH/DELETE:
if (user.role === 'EDITOR' && article.editorId !== user.id) throw new ForbiddenError()
```
Role checks are explicit in each handler — not in Next.js middleware.

### MCP Path Traversal
`POST /api/import` validates the resolved path does not escape the MCP allowlist before calling the MCP client (prevent `../../etc/passwd`).

---

## 6. MCP Integration

### What it enables
Import local `.md` files as wiki articles without copy-pasting through the browser editor. An EDITOR/ADMIN provides a `filePath`; the API reads it via the Filesystem MCP server and creates the article.

### Configuration (`.mcp.json` in project root)
```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/home", "/tmp/wiki-imports"]
    }
  }
}
```
Path allowlist (`/home`, `/tmp/wiki-imports`) is the primary security boundary.

### Abstraction layer — `src/lib/mcp-filesystem.ts`
```typescript
type ReadFileResult = { content: string; mimeType: string; size: number }
export async function readFileViaMCP(filePath: string): Promise<ReadFileResult>
```
Normalizes MCP errors into wiki error hierarchy: `FileNotFoundError`, `FileAccessDeniedError`, `FileTooLargeError`.

### Data flow
```
POST /api/import { filePath }
  → requireSession() → assertRole('EDITOR')
  → ImportSchema.safeParse(body)
  → readFileViaMCP(filePath)          // calls @modelcontextprotocol/server-filesystem
  → validate mimeType (text/markdown or text/plain), size ≤ 50 000 chars
  → extract title from first H1 (regex /^# (.+)/m), fallback: filename
  → article creation pipeline (same as POST /api/articles)
  → 201 ArticleDetail
```

---

## 7. Implementation Phases

| Phase | Work | Estimate | Depends On |
|-------|------|----------|------------|
| 0 | Scaffolding: Next.js 15, tsconfig, ESLint, Vitest, Playwright, Prisma init | 2h | — |
| 1 | Data layer: Prisma schema, migrations + raw SQL trigger/GIN index, seed | 4h | 0 |
| 2 | Auth API + `lib/auth.ts` session helpers | 4h | 1 |
| 3 | Article CRUD API + Revision API + Tags API | 6h | 2 |
| 4 | Full-text search API (`lib/search.ts` + `GET /api/search`) | 3h | 3 |
| 5 | Admin API + Login/Register frontend + NavBar | 5h | 2, 3 |
| 6 | Article frontend (list, view, editor, tag input) | 8h | 3, 5 |
| 7 | Search frontend + Revision UI + DiffViewer | 6h | 4, 6 |
| 8 | Admin frontend (UserTable, role change, delete) | 3h | 5, 6 |
| 9 | MCP integration (`.mcp.json`, `lib/mcp-filesystem.ts`, `/api/import`) | 3h | 3 |
| 10 | E2E tests + GitHub Actions CI pipeline | 4h | all |
| 11 | Hardening: Suspense boundaries, error pages, security checklist, cache tags | 3h | 10 |

**Total: ~23 working days solo.** Phases 3–9 can be split across an API track and a frontend track after Phase 2.

### Phase dependency graph
```
Phase 0 → Phase 1 → Phase 2 → Phase 3 ──► Phase 4 → Phase 10 → Phase 11
                          │          └──► Phase 6 ──► Phase 7 ─┘
                          └─► Phase 5 ──► Phase 8 ──────────────┘
                                    Phase 3 → Phase 9 ──────────┘
```

---

## Critical Files

| File | Why Critical |
|------|-------------|
| `prisma/schema.prisma` | Foundation; every layer depends on it; must be written first with tsvector field declaration |
| `prisma/migrations/<init>/migration.sql` | Must be hand-edited to add tsvector column, trigger, and GIN index after `prisma migrate dev` generates it |
| `src/lib/auth.ts` | `requireSession` + `assertRole` error hierarchy called by every mutating handler |
| `src/types/schemas.ts` | Zod schemas are single source of truth for all request/response shapes |
| `src/lib/search.ts` | Only file using `prisma.$queryRaw`; most security-sensitive query; contains tsvector query builder |
| `src/lib/mcp-filesystem.ts` | MCP abstraction; isolates MCP client from import route |
| `src/components/editor/article-editor.tsx` | Most complex client component: split pane, tag management, save flow |

---

## Verification

After each phase, verify:

- **Phase 0**: `npm run dev` starts; `npm run lint` and `npm run type-check` pass
- **Phase 1**: `npx prisma studio` shows all tables with seed data; unit tests green
- **Phase 2**: `curl -X POST /api/auth/login` returns token; integration tests green
- **Phase 3**: Full CRUD via `curl` or Postman; revision count increments correctly
- **Phase 4**: `GET /api/search?q=postgresql` returns seeded article; prefix `postgre` also matches
- **Phase 6**: Create/edit article in browser; live preview updates while typing
- **Phase 7**: Search term highlighted in results; diff shows red/green line changes
- **Phase 9**: `POST /api/import` with a real local `.md` file path creates article
- **Phase 10**: All GitHub Actions stages pass on a clean push to `main`
