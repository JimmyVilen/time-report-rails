# TimeReport

Time reporting app built as a single TanStack Start application with a Hono API.

## Tech Stack

- **Framework**: TanStack Start (React 19, TanStack Router, Vite 8)
- **API**: Hono, mounted as a server route at `/api/*`
- **Data**: Drizzle ORM, PostgreSQL
- **Auth**: Better Auth, BCrypt and HttpOnly/SameSite=Lax cookie sessions
- **UI**: Tailwind CSS v4, TanStack Query, Lexical
- **Build**: Nitro, which targets Vercel and a plain Node server from one build
- **Deploy**: Vercel (production + per-branch previews), or a non-root container

## Architecture

One Vite app builds both halves:

- `src/routes/` — file-based routes. `_app.tsx` is the authenticated layout and
  holds the session guard; `api/$.ts` is a splat server route that hands every
  `/api/*` request to the Hono app untouched.
- `src/server/` — the API: Hono routes, Drizzle schema, Better Auth, services.
  Server-only; the Start plugin keeps it out of the client bundle.
- `src/features/`, `src/components/`, `src/api/` — the UI and its fetch wrappers.

The API contract is unchanged from when the backend was a standalone server;
see [docs/contract-inventory.md](docs/contract-inventory.md).

## Getting Started

### Requirements

- Node.js 24+
- Docker for local PostgreSQL

**Terminal 1 – PostgreSQL:**

```bash
docker compose up -d db
```

**Terminal 2 – app:**

```bash
npm install
cp .env.example .env
npm run db:migrate
npm run dev
```

Open http://localhost:5173. There is no proxy any more: the UI and the API are
served from the same origin.

### Environment

`.env` configures the Node process (`DATABASE_URL`, `BETTER_AUTH_SECRET`,
`BETTER_AUTH_URL`, `NODE_ENV`, `PORT`; the last two are optional, and hosted
deployments supply their own — see [Vercel](#vercel)). Vite deliberately does **not** read it —
`vite.config.ts` points `envDir` at the empty `env/` directory, because a
`NODE_ENV=development` line in `.env` would otherwise make `vite build` emit a
development bundle. Client-side `VITE_*` variables, if ever needed, belong in
`env/`.

### Building for Production

```bash
npm run build   # -> .output (Nitro picks its preset from the environment)
npm start       # node .output/server/index.mjs
```

Nitro chooses the preset at build time: `vercel` when `VERCEL` is set (output in
`.vercel/output`), otherwise `node-server`, whose `.output/` is self-contained —
server, bundled dependencies and static assets, no `npm install` needed to run it.

### Docker

```bash
BETTER_AUTH_SECRET="replace-with-at-least-32-random-characters" docker compose up --build
# App available at http://localhost:8080
```

### Vercel

The Vercel project builds from GitHub: `main` deploys to production, every other
branch gets a preview. Deploying needs no build configuration — Vercel detects
TanStack Start and Nitro — but the project must set:

| Variable                 | Scope              | Notes                                          |
| ------------------------ | ------------------ | ---------------------------------------------- |
| `DATABASE_URL`           | Production/Preview | Supabase **transaction** pooler (port 6543)    |
| `MIGRATION_DATABASE_URL` | Production         | Session pooler (port 5432); migrations need it |
| `BETTER_AUTH_SECRET`     | Production/Preview | A different secret per environment             |
| `MIGRATE_ON_DEPLOY`      | Preview (optional) | `true` migrates a dedicated preview database   |

Do not set `PORT` or `BETTER_AUTH_URL` on Vercel. `PORT` is only used by the
standalone Node server, and the auth URL is derived per deployment: previews
follow their own hostname, production uses the project's production domain, and
both trust the branch alias (see `resolveAuthUrl` in `src/server/config.ts`).
Every preview shares that project's `DATABASE_URL`, so point it at a database
that is not production.

Migrations run from `vercel-build` before the app is built, and only for the
production deployment unless `MIGRATE_ON_DEPLOY=true` opts an environment in.

## Checks

```bash
npm run typecheck   # app project, then the stricter server project
npm run lint
npm test            # set TEST_DATABASE_URL for the PostgreSQL contract tests
```

`tsconfig.json` covers the UI; `tsconfig.server.json` adds the stricter flags
(`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`,
`noPropertyAccessFromIndexSignature`) that `src/server`, `test` and `scripts`
were written against. ESLint mirrors the same split.
