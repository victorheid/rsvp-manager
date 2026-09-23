# Integrations

Thin adapters over external services: Stripe, SMS/WhatsApp, web push. Each
adapter exposes a small interface that domain actions depend on, so tests
can swap in a fake (see CLAUDE.md → Testing: "Mock only external
integrations, using fake adapters from `integrations/`").

Not started yet — see specs/tasks.md §0 and §5.

Planned shape:

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
