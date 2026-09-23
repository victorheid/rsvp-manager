# Integrations

Thin adapters over external services: Stripe, SMS/WhatsApp, web push. Each
adapter exposes a small interface that domain actions depend on, so tests
can swap in a fake (see CLAUDE.md → Testing: "Mock only external
integrations, using fake adapters from `integrations/`").

Built: `sms/` (console + fake; no real provider yet) and `push/` (Web Push, console, fake). Not started: `stripe/` — see specs/tasks.md §0 and §5.

Shape:

```
integrations/
  stripe/
    client.ts       # real Stripe SDK wrapper
    fake.ts         # in-memory fake for tests
  sms/
    client.ts
    fake.ts
  push/
    client.ts
    fake.ts
```
