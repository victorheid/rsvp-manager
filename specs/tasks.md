# MVP Task Tracker

Tracks implementation status against [`feature-spec-mvp.md`](./feature-spec-mvp.md). Update as work lands — check items off in the same PR that completes them.

## Blockers / decisions pending
- [ ] Legal check: does the wallet need an e-money licence or licensed partner? (blocks §5 wallet only)
- [ ] Accountant: VAT treatment of our service fee (affects break-even and how the fee is shown)

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
- [ ] Create event (title, description, start + end time, location, cut-off, min default 1, optional max)
- [ ] Cost: total + optional display-only breakdown
- [ ] Pricing modes: fixed per-head / split evenly (range shown before confirmation)
- [ ] Payment options (cash only / online only / both; online only after Stripe onboarding) and "Auto-charge at cut-off" toggle
- [ ] Shareable `/e/{slug}` event link, viewable without an account
- [ ] Duplicate event from a previous one
- [ ] Edit event: notify RSVPers; block price increases after first RSVP; lowering max moves latest RSVPs to front of waitlist

## 3. Confirmation & cut-off
- [ ] Auto-confirm at cut-off (auto-charge on + min met)
- [ ] Manual confirm (any time)
- [ ] Price lock at confirmation
- [ ] Post-confirmation joins: immediate charge at locked price (drop-out allowed, no auto-refund)

## 4. RSVP flow
- [ ] Public event page: spots left, price/range, cut-off, who's in (first name + last initial)
- [ ] RSVP: phone + SMS code (first time) → wallet / card / cash
- [ ] Drop out: free before confirmation; after confirmation no auto-refund, organizer may refund

## 5. Payments, wallet & payouts
- [ ] Fee schedules: versioned tiers (game card payments, top-ups), never edited in place
- [ ] Pin fee schedule version on event at creation; duplicates use current schedule
- [ ] Store exact fee charged on every payment
- [ ] Wallet: balance, top-ups (€20 min / €50 / €100) + stepped top-up fee, €150 max balance
- [ ] Wallet holds (upper bound for split pricing), realized or released
- [ ] Card RSVP: SetupIntent at RSVP, charge price + service fee at confirmation
- [ ] Failed charge → "owes" status + pay link
- [ ] Price + service fee display, and "save by topping up" prompt on card RSVP
- [ ] Wallet refund on request at full value; ID check for refunds over €50 (pending legal)
- [ ] Stripe Connect onboarding for organizers (only for events accepting online payment)
- [ ] Payout release after event (+2 days)

## 6. Waitlist
- [ ] Join waitlist: "Auto-join and pay" (default, wallet/card only, card saved) or "Notify me" (no payment method until claim) + priority copy
- [ ] Ordering: auto-join entries first, then notify-me, first come first served within each; switching mode keeps join time
- [ ] Spot opens → auto-join next (skip if wallet can't cover it)
- [ ] Only notify-me entries left → notify all, first to claim wins (claim = normal RSVP, cash allowed)
- [ ] Close waitlist at event start

## 7. Event lifecycle
- [ ] States: Open / Confirmed / Cancelled / Expired
- [ ] Cancel → full refunds including service fee, release holds
- [ ] Expire unconfirmed events 48h after start → release holds

## 8. Organizer event list
- [ ] Single list: attendance status + payment status + per-group no-show count
- [ ] Mark attendance
- [ ] Mark paid outside app
- [ ] Add walk-in (name only, doesn't count against max)
- [ ] Dropped-out entries stay on the list marked "Dropped out" with their payment status (organizer can refund as usual)
- [ ] Remove a player (pending confirmation)
- [ ] Refund one / refund all online-paid (price only, service fee kept; until payout)

## 9. Notifications
- [ ] Trigger table from spec §9 wired to push
- [ ] SMS/WhatsApp fallback for money-related messages only
- [ ] Cut-off reminder job
- [ ] Organizer alert when cut-off passes unconfirmed (confirm anyway / cancel)
