# RSVP Manager

Group sports RSVP + payments app. Product spec: [specs/feature-spec-mvp.md](specs/feature-spec-mvp.md). Engineering conventions: [CLAUDE.md](CLAUDE.md).

## Setup

```bash
pnpm install
cp .env.example .env   # point DATABASE_URL at a local Postgres
pnpm db:migrate
pnpm dev
```

## Commands

| Command | What it does |
|---|---|
| `pnpm dev` | Run the app locally |
| `pnpm build` | Production build |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm lint` | ESLint |
| `pnpm test` | Vitest — unit tests always run; feature tests need `DATABASE_URL` and skip themselves otherwise |
| `pnpm db:migrate` | Apply a Prisma schema change |
| `pnpm db:studio` | Browse the database |
