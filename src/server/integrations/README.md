# Integrations

Thin adapters over external services: Stripe, SMS/WhatsApp, web push. Each
adapter exposes a small interface that domain actions depend on, so tests
can swap in a fake (see CLAUDE.md → Testing: "Mock only external
integrations, using fake adapters from `integrations/`").

Built: `sms/` (console + fake; no real provider yet), `push/` (Web Push, console, fake) and `stripe/` (the `PaymentGateway` interface, an in-memory fake, and a contract test suite; no real Stripe adapter yet).

Domains never import a third-party SDK — only the interface from here. `stripe/contract.ts` is the behaviour every gateway must have: run it against the real adapter (Stripe test mode) once one exists, so the fake can't drift.

Shape:

```
integrations/
  stripe/
    types.ts        # PaymentGateway: what the app needs, in integer cents
    fake.ts         # in-memory fake (tests + local dev)
    contract.ts     # shared behaviour suite
    index.ts        # getPaymentGateway()
  sms/
    client.ts
    fake.ts
  push/
    client.ts
    fake.ts
```
