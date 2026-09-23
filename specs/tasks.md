# MVP Task Tracker

Tracks implementation status against [`feature-spec-mvp.md`](./feature-spec-mvp.md). Update as work lands — check items off in the same PR that completes them.

## Blockers / decisions pending
- [ ] Legal check: does the wallet need an e-money licence or licensed partner? (blocks §5 wallet only)
- [ ] Platform business model: platform cut per payment?
- [ ] Who absorbs Stripe's fee on organizer-issued refunds and cancellations?

## 0. Foundations
- [x] Repo scaffold: Next.js + TypeScript + Postgres + Prisma (+ tRPC, Zod, Vitest — see [CLAUDE.md](../CLAUDE.md))
- [ ] Auth: phone number + SMS code, triggered only at RSVP
- [ ] Stripe account/keys wired up (test mode), incl. Connect
- [ ] Background worker for time-based jobs (cut-off auto-confirm, event expiry, payout release)
- [ ] Web push setup (service worker, subscription storage)
- [ ] SMS/WhatsApp fallback provider wired up

## 1. Groups
- [ ] Create group (name, description) → shareable `/g/{slug}` link
- [ ] Join via group link, and auto-join on RSVP
- [ ] Group page: list of events
- [ ] Group admins model (one for MVP, many-ready)

## 2. Events
- [ ] Create event (title, description, date/time, location, cut-off, min default 1, optional max)
- [ ] Cost: total + optional display-only breakdown
- [ ] Pricing modes: fixed per-head / split evenly (range shown before confirmation)
- [ ] "Cash allowed" and "Auto-charge at cut-off" toggles
- [ ] Shareable `/e/{slug}` event link, viewable without an account
- [ ] Duplicate event from a previous one
- [ ] Edit event: notify RSVPers; block price increases after first RSVP; lowering max moves latest RSVPs to front of waitlist

## 3. Confirmation & cut-off
- [ ] Auto-confirm at cut-off (auto-charge on + min met)
- [ ] Manual confirm (any time)
- [ ] Price lock at confirmation
- [ ] Post-confirmation joins: immediate charge at locked price, no self-cancel

## 4. RSVP flow
- [ ] Public event page: spots left, price/range, cut-off, who's in (first name + last initial)
- [ ] RSVP: phone + SMS code (first time) → wallet / card / cash
- [ ] Self-cancel before confirmation

## 5. Payments, wallet & payouts
- [ ] Wallet: balance, top-ups (€20/€50/€100), €150 max balance
- [ ] Wallet holds (upper bound for split pricing), realized or released
- [ ] Card RSVP: SetupIntent at RSVP, charge at confirmation
- [ ] Failed charge → "owes" status + pay link
- [ ] Fee display + "save by topping up" prompt on card RSVP
- [ ] Wallet refund on request (blended fee rate); ID check for refunds over €50 (pending legal)
- [ ] Stripe Connect onboarding for organizers (only for events accepting online payment)
- [ ] Payout release after event (+2 days)

## 6. Waitlist
- [ ] Join waitlist with payment method + "Auto-promote me" (default on) + priority copy
- [ ] Ordering: auto-promote entries first, then manual, first come first served within each
- [ ] Spot opens → auto-promote next (skip if wallet can't cover hold)
- [ ] Only manual entries left → notify all, first to claim wins
- [ ] Close waitlist at event start

## 7. Event lifecycle
- [ ] States: Open / Confirmed / Cancelled / Expired
- [ ] Cancel → full refunds, release holds
- [ ] Expire unconfirmed events 48h after start → release holds

## 8. Organizer event list
- [ ] Single list: attendance status + payment status + per-group no-show count
- [ ] Mark attendance
- [ ] Mark paid outside app
- [ ] Add walk-in (name only, doesn't count against max)
- [ ] Refund one / refund all online-paid (until payout)

## 9. Notifications
- [ ] Trigger table from spec §9 wired to push
- [ ] SMS/WhatsApp fallback for money-related messages only
- [ ] Cut-off reminder job
