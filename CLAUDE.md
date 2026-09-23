# RSVP Manager

Group sports RSVP + payments app. Product spec: [specs/feature-spec-mvp.md](specs/feature-spec-mvp.md). Task tracker: [specs/tasks.md](specs/tasks.md). Tick items off in the same PR that completes them.

## Stack

Next.js (App Router) · TypeScript (strict) · tRPC · Prisma + Postgres · Zod · Vitest · Stripe

## Commands

- `pnpm dev` — run the app
- `pnpm typecheck` — `tsc --noEmit`
- `pnpm lint` — ESLint
- `pnpm test` — Vitest (unit + feature; feature tests need `DATABASE_URL` pointed at a disposable Postgres and skip themselves otherwise)
- `pnpm db:migrate` — apply a schema change (`prisma migrate dev`)
- `pnpm db:studio` — browse the database

A change is done only when typecheck, lint and tests pass.

## Type flow: Prisma → tRPC → client

The Prisma schema is the source of truth. Types flow from it without being retyped:

```
schema.prisma → Prisma client types → actions/getters → tRPC routers → client (inferred AppRouter)
```

- Never hand-write a type that duplicates a Prisma model or a procedure's input/output. Derive it: `Prisma.EventGetPayload<...>`, `RouterOutputs['events']['getBySlug']`, `z.infer<typeof schema>`.
- Changing the schema should break the client's compile where it matters. If it doesn't, a type is being duplicated somewhere.
- Everything from outside (tRPC input, webhooks, env vars, JSON columns) gets parsed with Zod at the boundary. Inside the boundary, trust the types.

## Domains: actions, getters, rules

Lightweight DDD. Code is grouped by business domain, not by technical layer.

```
src/server/
  domains/
    events/
      actions/
        createEvent.ts
        confirmEvent.ts
        confirmEvent.test.ts
      getters/
        getEventBySlug.ts
      rules.ts          # pure business rules
      rules.test.ts
      router.ts         # tRPC procedures
      index.ts          # public API for other domains
  integrations/         # Stripe, SMS, push: thin adapters
  db.ts
  trpc.ts
```

Initial domains match the spec sections: `groups`, `events`, `rsvps`, `waitlist`, `wallet`, `payouts`, `notifications`, `auth`.

| Piece | Does | Doesn't |
|---|---|---|
| **Getter** | Reads state and returns data shaped for the caller. | Write anything or trigger side effects. |
| **Action** | One business operation that changes state, named with a verb (`confirmEvent`, `cancelRsvp`). Loads data, checks rules, writes in one transaction. One per file. | Contain rule logic worth unit testing. Pull that out into `rules.ts`. |
| **Rules** (`rules.ts`) | Pure functions for business rules: `canSelfCancel(rsvp, event, now)`, `perHeadPriceCents(event, headcount)`. | Touch Prisma, the network, or `Date.now()`. Pass `now` in. |
| **Router** | Auth check + Zod input + a call to exactly one action or getter. | Hold business logic or call Prisma directly. |

Each domain has exactly one `rules.ts`, even as it grows. Don't split it into a `rules/` folder: one file is easy to find and scan.

Where business rules live: **`rules.ts` first, actions second, nowhere else.** Not in routers, React components, Prisma middleware or DB triggers. A developer asking "why can't I cancel?" should find the answer in `rsvps/rules.ts`.

Cross-domain:
- Import another domain only through its `index.ts`. Never reach into its internal files.
- An action that affects another domain calls that domain's action (e.g. `confirmEvent` → `wallet.realizeHolds`) and passes the transaction client through.
- No circular imports between domains. If you'd need one, move the orchestration into the action that starts the flow.
- Never call an external service (Stripe, SMS, push) inside a DB transaction. Notifications go out after commit.

State changes go only through actions. Event/RSVP statuses are Prisma enums, and every transition (e.g. `OPEN → CONFIRMED`) happens in exactly one action.

## Easy to delete

- You should be able to remove a feature by deleting its folder(s) plus one line in the root router.
- Use plain functions like `(db, input, ctx) => result`. No repository classes, base classes, DI containers or generic "service" layers.
- Don't abstract until the third copy. Two similar functions are fine.
- No `utils/` or `helpers/` dumping grounds. Shared code lives in the domain that owns it until a second domain really needs it.
- Keep code simple over clever. When unsure, pick the version that is easier to read and to delete.

## TypeScript: no escape hatches

Forbidden:
- `any`, explicit or implicit. Use `unknown` and narrow it.
- Type assertions (`x as Foo`, `<Foo>x`). `as const` is the only exception.
- Non-null assertions (`x!`).
- `@ts-ignore`, `@ts-nocheck`, `@ts-expect-error`, and `eslint-disable` for any of the rules above.

When types don't line up, fix the types, the data model or the narrowing (Zod parse, type guard, `satisfies`, discriminated unions). Never silence the compiler. If you're truly stuck, stop and ask instead of casting.

Enforced by `tsconfig` (`strict`, `noUncheckedIndexedAccess`) and ESLint (`no-explicit-any`, `consistent-type-assertions: never`, `no-non-null-assertion`, `ban-ts-comment`). CI fails on violations.

## Testing

Vitest. Tests sit next to the code they cover (`confirmEvent.test.ts` beside `confirmEvent.ts`).

- **Unit tests** cover `rules.ts`. They're pure, fast and table-driven, and every rule in the spec gets one (price lock, split range, cancel window, waitlist ordering...).
- **Feature tests** cover actions end to end. Call through the tRPC `createCaller` against a real Postgres test DB that's reset between tests, then assert on the return value and the resulting DB state. Don't mock Prisma.
- Mock only external integrations (Stripe, SMS, push), using fake adapters from `integrations/`.
- Time-dependent logic takes `now` as an argument, so tests pass fixed dates.
- A bug fix starts with a failing test.
- Money paths (charges, holds, refunds, price lock, payouts) need feature tests for both the success and the failure path.

## Domain conventions

- Money is integer cents (`Int`) in EUR only, never floats. Split-price rounding lives in a single rule function.
- Times are stored as UTC `DateTime` and converted only for display.
- Public URLs use slugs (`/g/{slug}`, `/e/{slug}`). Internal references use IDs.
