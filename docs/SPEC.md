# Wiki Application — Formal Specification

**Project:** my-capstone  
**Stack:** Next.js 15 · TypeScript · Prisma · PostgreSQL · Tailwind CSS  
**Version:** 1.0  
**Last Updated:** 2026-04-15

---

## Table of Contents

1. [Requirements](#1-requirements)
2. [Technical Design](#2-technical-design)
3. [Implementation Plan](#3-implementation-plan)
4. [Scope Boundaries](#4-scope-boundaries)
5. [Success Criteria](#5-success-criteria)
6. [Grading Rubric Cross-Reference](#6-grading-rubric-cross-reference)

---

## 1. Requirements

### 1.1 Roles

| Role | Description |
|------|-------------|
| `VIEWER` | Default role on registration. Read-only access to published articles. |
| `EDITOR` | Can create articles and edit/delete their own articles. Can view revision history. |
| `ADMIN` | Full access: manages users, roles, all articles, tags, and ownership transfers. |

---

### 1.2 User Stories & Acceptance Criteria

#### Authentication

**US-01 — Register**
> As a visitor, I want to register with email, username, and password so that I can access the wiki.

Acceptance Criteria:
- [ ] `POST /api/auth/register` creates a `User` with role `VIEWER` and returns a session token
- [ ] Duplicate email returns `409 Conflict`
- [ ] Username must be 3–30 alphanumeric/underscore/hyphen characters; violations return `422`
- [ ] Password minimum 8 characters with at least one digit; violations return `422`
- [ ] Password is stored as a bcrypt hash (cost 12) — never in plaintext

**US-02 — Login**
> As a registered user, I want to log in so that I can access role-protected features.

Acceptance Criteria:
- [ ] `POST /api/auth/login` returns `{ token, user }` on valid credentials
- [ ] Invalid password or unknown email returns `401`
- [ ] Token is stored as `HttpOnly; Secure; SameSite=Lax` cookie

**US-03 — Logout**
> As a logged-in user, I want to log out so that my session is invalidated immediately.

Acceptance Criteria:
- [ ] `POST /api/auth/logout` deletes the `Session` row
- [ ] Any subsequent request using the invalidated token returns `401`

---

#### Article Management

**US-04 — Browse articles**
> As any visitor, I want to browse published articles so that I can discover wiki content.

Acceptance Criteria:
- [ ] `GET /api/articles` returns paginated list of published articles (max 100 per page)
- [ ] Response includes `id`, `slug`, `title`, `excerpt`, `createdBy`, `tags`, `createdAt`, `updatedAt`
- [ ] Unauthenticated requests never receive unpublished articles
- [ ] Results can be filtered by `tag` and `author` query params

**US-05 — View article**
> As any visitor, I want to view a single article rendered from markdown so that I can read content.

Acceptance Criteria:
- [ ] `GET /api/articles/:id` accepts either cuid or slug
- [ ] Markdown is rendered server-side and sanitized (no `<script>`, no event attributes)
- [ ] Unpublished articles return `404` for non-owners and non-admins

**US-06 — Create article**
> As an EDITOR, I want to write and publish a new article using a markdown editor with live preview.

Acceptance Criteria:
- [ ] `POST /api/articles` creates the article and automatically creates `Revision` with `revisionNum = 1`
- [ ] Title: 1–200 characters; Content: 1–50,000 characters; Tags: max 10, each 1–50 characters
- [ ] A URL-safe slug is generated from the title (kebab-case + cuid suffix for uniqueness)
- [ ] VIEWER calling this endpoint returns `403`
- [ ] The editor UI shows a split pane: raw markdown on the left, live preview on the right

**US-07 — Edit article**
> As an EDITOR (own articles) or ADMIN (any article), I want to update an article's title, content, or tags.

Acceptance Criteria:
- [ ] `PATCH /api/articles/:id` succeeds for the article's `editorId` owner or any ADMIN
- [ ] A new `Revision` is created **only** when `title` or `content` changes; tag-only edits do not create a revision
- [ ] `updatedById` is set to `session.userId` on every successful PATCH
- [ ] An EDITOR attempting to edit another user's article returns `403`

**US-08 — Delete article**
> As an ADMIN, I want to permanently delete an article including all its revisions.

Acceptance Criteria:
- [ ] `DELETE /api/articles/:id` hard-deletes the article; `Revision` and `ArticleTag` rows cascade
- [ ] Non-ADMIN callers receive `403`

---

#### Revision History

**US-09 — View revision history**
> As an EDITOR or ADMIN, I want to see the full history of changes to an article.

Acceptance Criteria:
- [ ] `GET /api/articles/:id/revisions` returns a paginated list with `revisionNum`, `author`, `changeNote`, `createdAt` (no `content` in list — too large)
- [ ] `revisionNum` is monotonically increasing per article, starting at 1
- [ ] VIEWER calling this endpoint returns `403`

**US-10 — Compare revisions**
> As an EDITOR or ADMIN, I want to diff any two revisions to understand what changed.

Acceptance Criteria:
- [ ] `GET /api/articles/:id/revisions/:num` returns the full content snapshot
- [ ] The UI diff viewer shows added lines in green, removed lines in red, unchanged context in neutral
- [ ] User can select any two revision numbers to compare via dropdowns

**US-11 — Restore revision**
> As an EDITOR (own article) or ADMIN, I want to restore a prior revision as the current version.

Acceptance Criteria:
- [ ] `POST /api/articles/:id/revisions/:num/restore` creates a **new** revision at the latest `revisionNum`; it does NOT delete history
- [ ] The restored article's `title` and `content` match the snapshot exactly
- [ ] An EDITOR attempting to restore another user's article returns `403`

---

#### Search

**US-12 — Full-text search**
> As any visitor, I want to search articles by keywords so that I can find relevant content quickly.

Acceptance Criteria:
- [ ] `GET /api/search?q=...` returns ranked results using PostgreSQL `tsvector` + `ts_rank`
- [ ] Prefix matching works (e.g., `"postgre"` matches articles containing `"postgresql"`)
- [ ] Results can be filtered by `tag`
- [ ] Empty `q` returns `400`; `q` exceeding 200 characters returns `422`
- [ ] Search input has a 300 ms debounce; matching terms are highlighted in results

---

#### Tags

**US-13 — Browse by tag**
> As any visitor, I want to filter articles by tag so that I can explore related content.

Acceptance Criteria:
- [ ] `GET /api/tags` returns all tags ordered by article count (descending)
- [ ] `GET /api/tags/:name/articles` returns paginated articles for that tag

**US-14 — Manage tags**
> As an ADMIN, I want to delete tags that are no longer needed.

Acceptance Criteria:
- [ ] `DELETE /api/tags/:name` removes the tag and all `ArticleTag` join rows
- [ ] Non-ADMIN callers receive `403`

---

#### Administration

**US-15 — Manage users**
> As an ADMIN, I want to view, search, and update user roles.

Acceptance Criteria:
- [ ] `GET /api/admin/users` returns paginated users with article count; supports username/email search
- [ ] `PATCH /api/admin/users/:id/role` changes a user's role; sets `updatedById = session.userId`
- [ ] An ADMIN cannot demote themselves
- [ ] The last remaining ADMIN cannot be demoted
- [ ] Non-ADMIN callers receive `403`

**US-16 — Transfer article ownership**
> As an ADMIN, I want to reassign an article's ownership to another EDITOR or ADMIN.

Acceptance Criteria:
- [ ] `PATCH /api/admin/articles/:id/owner` updates `editorId` to the target user
- [ ] Target user must have role `EDITOR` or `ADMIN`; otherwise `400`
- [ ] After transfer, the new owner can edit the article; the previous owner cannot (unless ADMIN)
- [ ] `createdById` (original author) is never changed

---

#### MCP Integration

**US-17 — Import local markdown files**
> As an EDITOR or ADMIN, I want to import a local `.md` file as a wiki article without copy-pasting.

Acceptance Criteria:
- [ ] `POST /api/import` reads the file via the Filesystem MCP server and creates a new article
- [ ] Title is extracted from the first `# Heading`; falls back to filename without extension
- [ ] File must be `text/markdown` or `text/plain`; size must not exceed 50,000 characters
- [ ] Path traversal attempts (`../../etc/passwd`) are rejected with `400`
- [ ] VIEWER calling this endpoint returns `403`

---

## 2. Technical Design

### 2.1 Data Model

```
┌─────────────────────────────────────────────────────────────────────────┐
│  User                                                                   │
│  ─────────────────────────────────────────────────────                  │
│  id           String   (cuid, PK)                                       │
│  email        String   (unique)                                         │
│  username     String   (unique)                                         │
│  passwordHash String                                                    │
│  role         Role     VIEWER | EDITOR | ADMIN  (default: VIEWER)       │
│  createdAt    DateTime                                                  │
│  createdById  String?  → User (self-ref, null = self-registration)      │
│  updatedAt    DateTime (@updatedAt)                                     │
│  updatedById  String?  → User (null until first admin edit)             │
└──────────────────┬──────────────────────────────────────────────────────┘
                   │ 1
                   │           ┌─────────────────────────────────────────┐
                   │           │  Article                                │
                   │           │  ────────────────────────────────────── │
                   │ createdBy │  id            String  (cuid, PK)       │
                   └──────────►│  slug          String  (unique)         │
                               │  title         String                   │
                               │  content       String  (markdown)       │
                               │  excerpt       String? (first 200 chars)│
                               │  isPublished   Boolean (default: true)  │
                               │  searchVector  tsvector (GIN indexed)   │
                               │  createdAt     DateTime                 │
                               │  createdById   String  → User           │
                               │  editorId      String  → User (owner)   │
                               │  updatedAt     DateTime (@updatedAt)    │
                               │  updatedById   String? → User           │
                               └──┬─────────────┬───────────────────────┘
                                  │ 1           │ 1
                    ┌─────────────┘             └────────────────┐
                    │ many                                  many  │
       ┌────────────▼────────────────┐     ┌──────────────────────▼──────┐
       │  Revision  (append-only)    │     │  ArticleTag  (join)         │
       │  ─────────────────────────  │     │  ──────────────────────     │
       │  id           String (PK)   │     │  articleId  String (PK)     │
       │  articleId    String → Art  │     │  tagId      String (PK)     │
       │  title        String (snap) │     │  createdAt  DateTime        │
       │  content      String (snap) │     │  createdById String → User  │
       │  changeNote   String?       │     └──────────┬──────────────────┘
       │  revisionNum  Int           │                │ many
       │  createdAt    DateTime      │     ┌──────────▼──────────────────┐
       │  createdById  String → User │     │  Tag                        │
       │  UNIQUE(articleId,revNum)   │     │  ───────────────────────    │
       └─────────────────────────────┘     │  id          String (PK)   │
                                           │  name        String (uniq) │
                                           │  createdAt   DateTime      │
       ┌─────────────────────────────┐     │  createdById String → User │
       │  Session                    │     │  updatedAt   DateTime      │
       │  ─────────────────────────  │     │  updatedById String? → User│
       │  id        String (PK)      │     └─────────────────────────────┘
       │  userId    String → User    │
       │  token     String (unique)  │
       │  expiresAt DateTime         │
       │  createdAt DateTime         │
       └─────────────────────────────┘
```

**Full-text search implementation:**
The `searchVector` column on `Article` is a PostgreSQL `tsvector`, maintained automatically by a database trigger that fires on `INSERT` or `UPDATE OF title, content`. A `GIN` index on this column makes ranked searches fast. This cannot be expressed in Prisma DSL — it is applied as raw SQL in the initial migration file.

---

### 2.2 API Contracts

#### Auth

| Method | Endpoint | Auth Required | Request Body | Success Response |
|--------|----------|---------------|--------------|-----------------|
| POST | `/api/auth/register` | — | `{ email, username, password }` | `201 { token, user: { id, email, username, role } }` |
| POST | `/api/auth/login` | — | `{ email, password }` | `200 { token, user }` |
| POST | `/api/auth/logout` | Bearer | — | `200 { success: true }` |
| GET | `/api/auth/me` | Bearer | — | `200 { id, email, username, role }` |

Error codes: `401` bad credentials / missing token · `409` duplicate email or username · `422` validation failure

#### Articles

| Method | Endpoint | Min Role | Request | Success Response |
|--------|----------|----------|---------|-----------------|
| GET | `/api/articles` | — | `?page&limit&tag&author` | `200 { articles[], pagination }` |
| POST | `/api/articles` | EDITOR | `{ title, content, tags?, changeNote?, isPublished? }` | `201 ArticleDetail` |
| GET | `/api/articles/:id` | — | — | `200 ArticleDetail` |
| PATCH | `/api/articles/:id` | EDITOR† | `{ title?, content?, tags?, changeNote?, isPublished? }` | `200 ArticleDetail` |
| DELETE | `/api/articles/:id` | ADMIN | — | `204` |

† EDITOR may only edit articles where `editorId === session.userId`; ADMIN may edit any.

`ArticleDetail` shape:
```json
{
  "id": "...", "slug": "...", "title": "...", "content": "...", "excerpt": "...",
  "isPublished": true,
  "createdBy": { "id": "...", "username": "..." },
  "editor": { "id": "...", "username": "..." },
  "updatedBy": { "id": "...", "username": "..." },
  "tags": ["tutorial", "reference"],
  "revisionCount": 3,
  "createdAt": "...", "updatedAt": "..."
}
```

#### Revisions

| Method | Endpoint | Min Role | Notes |
|--------|----------|----------|-------|
| GET | `/api/articles/:id/revisions` | EDITOR | Paginated list; no `content` field |
| GET | `/api/articles/:id/revisions/:num` | EDITOR | Full snapshot with `content` |
| POST | `/api/articles/:id/revisions/:num/restore` | EDITOR† | Creates new revision at latest num |

#### Search

| Method | Endpoint | Auth | Notes |
|--------|----------|------|-------|
| GET | `/api/search?q=...` | — | `?q&page&limit&tag`; ranked by `ts_rank` |

Response: `{ results: [{ id, slug, title, excerpt, createdBy, tags, rank, createdAt }], pagination, query }`

#### Tags

| Method | Endpoint | Auth | Notes |
|--------|----------|------|-------|
| GET | `/api/tags` | — | Returns `{ tags: [{ id, name, articleCount }] }` |
| GET | `/api/tags/:name/articles` | — | Paginated articles |
| DELETE | `/api/tags/:name` | ADMIN | Cascades join rows |

#### Admin

| Method | Endpoint | Auth | Notes |
|--------|----------|------|-------|
| GET | `/api/admin/users` | ADMIN | Paginated; `?search` by username/email |
| PATCH | `/api/admin/users/:id/role` | ADMIN | `{ role }` — no self-demotion; last-ADMIN guard |
| DELETE | `/api/admin/users/:id` | ADMIN | `409` if user has articles |
| PATCH | `/api/admin/articles/:id/owner` | ADMIN | `{ editorId }` — ownership transfer |

#### MCP Import

| Method | Endpoint | Auth | Notes |
|--------|----------|------|-------|
| POST | `/api/import` | EDITOR | `{ filePath, tags?, isPublished? }` |

---

### 2.3 Component Tree

```
RootLayout (SC)
└── NavBar (SC) — user: SessionUser | null
    └── SearchTrigger (CC) — pushes ?q= to router
│
├── (auth)/login/page (SC)
│   └── LoginForm (CC) — RHF + Zod; calls POST /api/auth/login
│
├── (auth)/register/page (SC)
│   └── RegisterForm (CC) — RHF + Zod; calls POST /api/auth/register
│
├── articles/page (SC) — fetches article list server-side
│   └── ArticleList (SC) — articles: ArticleSummary[], pagination
│       └── ArticleCard (SC) — article, showAuthor?
│           └── Badge (SC) — tag names, roles
│       └── Pagination (SC) — prev/next/numbered links
│
├── articles/[slug]/page (SC) — fetches article server-side
│   └── ArticleBody (SC) — content: string (remark+rehype server-side)
│
├── articles/new/page (SC shell)
│   └── ArticleEditor (CC) — split-pane editor/preview
│       ├── TagInput (CC) — value, onChange, suggestions
│       └── MarkdownPreview (CC) — content (uses `marked`)
│
├── articles/[slug]/edit/page (SC shell)
│   └── ArticleEditor (CC) — same, initialised with existing data
│
├── articles/[slug]/revisions/page (SC)
│   └── RevisionList (SC) — revisions, articleSlug, pagination, role
│       ├── DiffViewer (CC) — fromContent, toContent, fromNum, toNum
│       └── RestoreButton (CC) — articleId, revisionNum, onRestored
│
├── search/page (SC) — reads ?q= from searchParams
│   ├── SearchBar (CC) — initialQuery (300ms debounce)
│   └── SearchResults (SC) — results, query, pagination
│
└── admin/page (SC) — redirects non-ADMIN
    └── UserTable (CC) — users, pagination, currentUserId
        ├── Badge (SC) — role display
        └── ConfirmDialog (CC) — before destructive actions

UI Primitives (src/components/ui/):
  Pagination (SC) · Badge (SC) · ErrorMessage (SC)
  LoadingSpinner (CC) · ConfirmDialog (CC)
```

**Key conventions:**
- Server Component (SC) by default; `"use client"` only for interactivity or browser APIs
- Mutations call API routes via `fetch` — no Server Actions (API routes must exist for MCP import anyway)
- `ArticleBody` uses `remark` + `rehype-sanitize` + `rehype-highlight` server-side; `MarkdownPreview` uses `marked` client-side to avoid sending `remark` to the browser bundle

---

## 3. Implementation Plan

### Phase Overview

| # | Phase | Key Deliverables | Estimate | Depends On |
|---|-------|-----------------|----------|------------|
| 0 | Scaffolding | Next.js 15, tsconfig, ESLint, Vitest, Playwright, Prisma init | 2h | — |
| 1 | Data Layer | Prisma schema, migration SQL (tsvector trigger + GIN index), seed data | 4h | 0 |
| 2 | Auth API | `lib/auth.ts`, session helpers, all `/api/auth/*` routes, unit + integration tests | 4h | 1 |
| 3 | Article CRUD API | All article/revision/tag routes, slug utility, integration tests | 6h | 2 |
| 4 | Search API | `lib/search.ts`, `GET /api/search`, prefix-match tests | 3h | 3 |
| 5 | Admin API + Auth Frontend | Admin user/ownership endpoints, login/register pages, NavBar | 5h | 2, 3 |
| 6 | Article Frontend | ArticleList, ArticleView, ArticleEditor (split-pane), TagInput | 8h | 3, 5 |
| 7 | Search + Revision UI | SearchBar, SearchResults, RevisionList, DiffViewer, RestoreButton | 6h | 4, 6 |
| 8 | Admin Frontend | UserTable, role-change dropdown (optimistic), ownership transfer UI | 3h | 5, 6 |
| 9 | MCP Integration | `.mcp.json`, `lib/mcp-filesystem.ts`, `POST /api/import` | 3h | 3 |
| 10 | E2E + CI | 5 Playwright scenarios, GitHub Actions pipeline | 4h | all |
| 11 | Hardening | Suspense/error/404 boundaries, security checklist, cache tags | 3h | 10 |

**Total estimate: ~51 hours** (solo developer, full days)

### Dependency Graph

```
Phase 0 → Phase 1 → Phase 2 → Phase 3 ──► Phase 4 ──────────────► Phase 10 → Phase 11
                          │          └──► Phase 6 ──► Phase 7 ──────────┘
                          └─► Phase 5 ──► Phase 8 ────────────────────────┘
                                    Phase 3 → Phase 9 ──────────────────────┘
```

### Phase 0 Detail — Scaffolding

```bash
# Core framework
npm install next@15 react@19 react-dom@19

# TypeScript + types
npm install typescript @types/node @types/react @types/react-dom

# Styling
npm install tailwindcss @tailwindcss/postcss postcss

# Database + validation + auth
npm install prisma @prisma/client bcryptjs zod react-hook-form @hookform/resolvers @types/bcryptjs

# Markdown rendering
npm install remark remark-html rehype rehype-sanitize rehype-highlight marked diff

# Dev tooling
npm install -D vitest @vitest/ui @playwright/test tsx eslint @typescript-eslint/eslint-plugin @typescript-eslint/parser eslint-plugin-react eslint-plugin-react-hooks

# Prisma init
npx prisma init
```

Config files to create: `tsconfig.json` (strict, `@/*` alias), `next.config.ts`, `tailwind.config.ts`, `postcss.config.mjs`, `vitest.config.ts`, `playwright.config.ts`, `eslint.config.mjs`

### Phase 1 Detail — Data Layer

After `npx prisma migrate dev --name init`, manually edit the generated migration SQL to append:

```sql
ALTER TABLE "Article" ADD COLUMN "searchVector" tsvector;
CREATE OR REPLACE FUNCTION article_search_vector_update() RETURNS trigger AS $$
BEGIN
  NEW."searchVector" := to_tsvector('english',
    coalesce(NEW.title, '') || ' ' || coalesce(NEW.content, ''));
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER article_search_vector_trigger
  BEFORE INSERT OR UPDATE OF title, content ON "Article"
  FOR EACH ROW EXECUTE FUNCTION article_search_vector_update();
CREATE INDEX articles_search_idx ON "Article" USING GIN ("searchVector");
```

---

## 4. Scope Boundaries

The following are **explicitly out of scope** for v1.0. Implementing any of these without prior design review will be considered out-of-scope work.

| Category | What Is Excluded |
|----------|-----------------|
| Collaboration | Real-time co-editing (no WebSocket, no CRDT) |
| Media | File or image uploads; articles are markdown text only |
| Notifications | No email, push, or in-app notification system |
| Authentication | No OAuth, SAML, or SSO; password auth only |
| Internationalisation | UI and content are English only; no i18n framework |
| Mobile | No React Native or PWA; responsive web only |
| Search infrastructure | No Elasticsearch, Algolia, or external search engine; PostgreSQL `tsvector` only |
| Rate limiting | No per-IP or per-user rate limiting in v1 (no Redis dependency) |
| CORS | No cross-origin API access; same-origin only |
| Audit log UI | Audit columns exist in the DB but there is no admin UI for browsing them |
| Soft deletes | Deleted articles and users are hard-deleted |
| Two-factor authentication | Not included |

---

## 5. Success Criteria

The project is considered **complete** when all of the following are verifiable:

### 5.1 Functional Completeness

| ID | Criterion | How to Verify |
|----|-----------|---------------|
| F-01 | All 17 user stories have passing acceptance criteria | Run integration test suite (`npm test`) |
| F-02 | Full-text search returns relevant ranked results | `GET /api/search?q=<seeded-word>` returns correct article |
| F-03 | Prefix search works | `GET /api/search?q=postgre` matches articles with "postgresql" |
| F-04 | Revision history is append-only | Create, edit ×3, verify 4 revisions; no row is ever deleted |
| F-05 | Restore creates a new revision | Restore rev 1; verify new revision at max(revisionNum)+1 |
| F-06 | Role hierarchy enforced end-to-end | VIEWER cannot call `POST /api/articles`; EDITOR cannot edit another user's article |
| F-07 | Ownership transfer works | ADMIN transfers article; previous owner gets 403 on PATCH |
| F-08 | MCP import creates article from local file | `POST /api/import` with valid local `.md` path returns `201` |

### 5.2 Code Quality

| ID | Criterion | How to Verify |
|----|-----------|---------------|
| Q-01 | Zero TypeScript errors | `npm run type-check` exits 0 |
| Q-02 | Zero lint errors | `npm run lint` exits 0 |
| Q-03 | No `any` types without explanatory comment | Grep for `any` in `src/` |
| Q-04 | All Zod schemas in `src/types/schemas.ts` | No inline `z.object(...)` in route handlers |

### 5.3 Test Coverage

| ID | Criterion | How to Verify |
|----|-----------|---------------|
| T-01 | All unit tests pass | `npm test` exits 0 |
| T-02 | All integration tests pass against test DB | `npm test` with `TEST_DATABASE_URL` set |
| T-03 | All 5 E2E scenarios pass | `npm run test:e2e` exits 0 |
| T-04 | `buildTsQuery` edge cases covered | Unit tests for empty, long, special-char inputs |

### 5.4 Security

| ID | Criterion | How to Verify |
|----|-----------|---------------|
| S-01 | No raw SQL string interpolation | Grep for template literals in `$queryRaw` calls |
| S-02 | `rehype-sanitize` blocks `<script>` | Render article with `<script>alert(1)</script>` in content; assert stripped |
| S-03 | Path traversal rejected | `POST /api/import { filePath: "../../etc/passwd" }` returns `400` |
| S-04 | Session token is `HttpOnly` | Browser devtools → Application → Cookies → verify flag |
| S-05 | Password not stored in plaintext | Query `SELECT "passwordHash" FROM "User"` — must start with `$2b$` |

### 5.5 CI/CD

| ID | Criterion | How to Verify |
|----|-----------|---------------|
| C-01 | GitHub Actions pipeline passes on clean push | Green check on `main` branch |
| C-02 | Pipeline stages are ordered | Lint → Type-check → Test → Build → E2E |
| C-03 | Build produces no errors | `npm run build` exits 0 |

---

## 6. Grading Rubric Cross-Reference

The table below maps each rubric dimension to the specification sections and user stories that satisfy it.

| Rubric Dimension | Weight | Satisfied By | Spec Reference |
|-----------------|--------|-------------|----------------|
| **Functionality** — Core features work end-to-end | 25% | All 17 user stories implemented and passing | §1.2, §5.1 (F-01 – F-08) |
| **Database Design** — Normalised schema, relationships, indexing | 15% | 6 tables, proper FKs, cascade rules, GIN index on tsvector, audit columns on all tables | §2.1 |
| **API Design** — RESTful, consistent, well-validated | 15% | 22 endpoints with typed request/response, Zod validation, correct HTTP status codes | §2.2 |
| **Frontend Quality** — Component architecture, SC vs CC discipline | 10% | Server-first component tree, CC only where interactivity required, no data fetching in useEffect | §2.3 |
| **Security** — Auth, validation, injection prevention | 15% | bcrypt, HttpOnly sessions, Zod on all inputs, parameterised SQL, rehype-sanitize, SameSite=Lax | §5.4 (S-01 – S-05) |
| **Testing** — Unit, integration, and E2E coverage | 10% | Vitest unit + integration (rollback transactions), 5 Playwright E2E scenarios | §2 (Testing), §5.3 |
| **MCP Integration** — External tool wired into application | 5% | Filesystem MCP server configured; `POST /api/import` pipeline operational | US-17, §2.2 (MCP Import) |
| **CI/CD** — Automated pipeline on every push | 5% | GitHub Actions: Lint → Type-check → Test → Build → E2E | §3, §5.5 |

**Total: 100%**

> Rubric dimensions without a corresponding user story or spec section indicate a gap that must be resolved before implementation begins. All rows above are fully covered.

---

*This document is the authoritative specification for v1.0. Any change to scope, data model, or API contracts must be reflected here before implementation proceeds.*
