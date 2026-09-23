# RSVP Manager

Group sports RSVP + payments app. Product spec: [specs/feature-spec-mvp.md](specs/feature-spec-mvp.md). Engineering conventions: [CLAUDE.md](CLAUDE.md).

## Setup

```bash
pnpm install
cp .env.example .env        # point DATABASE_URL at a local Postgres
pnpm db:migrate
pnpm dev
```

Feature tests run against a second, disposable database so they never touch your dev data. Create one (e.g. `rsvp-app-test`) and point a `.env.test` at it:

```bash
echo 'DATABASE_URL="postgresql://<user>@localhost:5432/rsvp-app-test?schema=public"' > .env.test
pnpm db:test:migrate
```

Without `.env.test`, `pnpm test` still runs — feature tests just skip themselves.

## Commands

| Command | What it does |
|---|---|
| `pnpm dev` | Run the app locally |
| `pnpm build` | Production build |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm lint` | ESLint |
| `pnpm test` | Vitest — unit tests always run; feature tests need `DATABASE_URL` and skip themselves otherwise |
| `pnpm db:migrate` | Apply a Prisma schema change (dev DB) |
| `pnpm db:test:migrate` | Apply migrations to the test DB (`.env.test`) |
| `pnpm db:studio` | Browse the database |
| `/design` | (with `pnpm dev`) Live gallery of every UI component, Light and Dark. Docs: [`src/components/ui/README.md`](src/components/ui/README.md) |
| `pnpm worker` | Background worker: cut-off auto-confirm, event expiry (§3, §7) |
