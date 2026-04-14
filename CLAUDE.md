# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

A wiki application with full-text search, markdown editing, version history, and role-based permissions. Built to explore content management, search indexing, and revision tracking on top of a relational database.

**Stack:** Next.js 15 (App Router), TypeScript, Prisma ORM, PostgreSQL, Tailwind CSS.

## Commands

```bash
# Development
npm run dev           # start Next.js dev server (http://localhost:3000)
npm run build         # production build
npm run start         # run production build locally

# Database
npx prisma migrate dev          # apply migrations and regenerate client
npx prisma migrate deploy       # apply migrations in CI/production
npx prisma db seed               # seed initial data
npx prisma studio                # open Prisma GUI

# Code quality
npm run lint          # ESLint
npm run type-check    # tsc --noEmit

# Testing
npm test              # run all tests (Vitest)
npm test -- --run src/path/to/file.test.ts   # run a single test file
npm run test:e2e      # Playwright end-to-end tests
```

## Architecture

```
src/
├── app/                        # Next.js App Router pages and layouts
│   ├── (auth)/                 # login / register routes (unauthenticated)
│   ├── articles/               # article list, view, edit, new
│   ├── admin/                  # user management and permissions (admin only)
│   └── api/                    # API route handlers
│       ├── articles/           # CRUD + revision sub-routes
│       ├── search/             # full-text search endpoint
│       ├── tags/               # tag CRUD
│       └── auth/               # login, logout, session
├── components/                 # shared React components
│   ├── editor/                 # markdown editor with live preview
│   ├── search/                 # search bar and results
│   └── revision/               # diff viewer and revision list
├── lib/                        # server-side utilities
│   ├── prisma.ts               # singleton Prisma client
│   ├── auth.ts                 # session helpers and role checks
│   └── search.ts               # full-text search query builder
├── types/                      # shared TypeScript types and Zod schemas
└── prisma/
    ├── schema.prisma            # data model
    ├── migrations/              # migration history
    └── seed.ts                  # seed script
```

### Data model (key relationships)

- `User` has a `role` enum (`VIEWER`, `EDITOR`, `ADMIN`).
- `Article` stores current content plus a foreign key to the author.
- `Revision` is append-only; each save of an Article creates a new Revision row preserving the prior content.
- `Tag` ↔ `Article` is a many-to-many join via `ArticleTag`.
- Full-text search uses a PostgreSQL `tsvector` column on `Article`, updated via a database trigger.

### Request lifecycle

API routes in `app/api/` validate the session and role before touching the database. Role checks live in `lib/auth.ts` and are called at the top of every mutating handler — not in middleware — so they remain explicit and testable. Prisma queries run only in server components and API routes, never in client components.

### MCP integration

A Filesystem MCP server is configured for local document import. It exposes the local filesystem to the import pipeline so markdown files can be ingested as articles without manual copy-paste.

## Coding conventions

**Naming**
- Files and directories: `kebab-case` (e.g. `article-editor.tsx`, `revision-list.tsx`).
- React components: `PascalCase` named exports.
- Server utilities and hooks: `camelCase` named exports.
- Database model fields: `camelCase` (Prisma default).
- API route segments follow REST resource naming: `/api/articles/:id/revisions`.

**TypeScript**
- `strict: true` is enforced. No `any` without an explanatory comment.
- Zod schemas in `src/types/` are the single source of truth for request/response shapes; derive TypeScript types from them with `z.infer`.
- Prefer `type` over `interface` for data shapes; use `interface` only when extension is the intent.

**React / Next.js**
- Default to React Server Components. Add `"use client"` only when browser APIs or interactivity are required.
- Data fetching happens in server components or `lib/` helpers — not inside `useEffect`.
- Tailwind utility classes only; no CSS modules or styled-components.

**Database**
- All schema changes go through Prisma migrations (`prisma migrate dev`). Never edit the database directly.
- Write raw SQL only for full-text search queries that Prisma cannot express; isolate these in `lib/search.ts`.

## Testing strategy

- **Unit tests (Vitest):** pure functions in `lib/` and Zod schema validation. No database, no network.
- **Integration tests (Vitest + Prisma test client):** API route handlers tested against a real PostgreSQL test database using transactions that roll back after each test.
- **E2E tests (Playwright):** golden-path flows — create article, search, view revision history, admin permission change.
- CI runs unit and integration tests on every push; E2E runs on PRs targeting `main`.

## CI/CD (GitHub Actions)

Pipeline stages in order: **Lint → Type-check → Test → Build → Security scan → Deploy**.
Deployment target and environment variables are configured as repository secrets.

## Scope boundaries — what this project does NOT include

- **Real-time collaboration** (no WebSocket or CRDT-based co-editing).
- **File/image uploads** (articles are markdown text only).
- **Email notifications** (no SMTP integration or email-based workflows).
- **OAuth / SSO** (authentication is username + password only; no third-party providers).
- **Internationalization** (UI and content are English only).
- **Mobile-native app** (responsive web only; no React Native).
- **External search engine** (search runs entirely in PostgreSQL; no Elasticsearch or Algolia).
