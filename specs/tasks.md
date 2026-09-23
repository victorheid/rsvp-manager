# MVP Task Tracker

Tracks implementation status against [`feature-spec-mvp.md`](./feature-spec-mvp.md). Update as work lands — check items off in the same PR that completes them.

## Blockers / decisions pending
- [ ] Legal check: does the wallet need an e-money licence or licensed partner? (blocks §5 wallet only)
- [ ] Accountant: VAT treatment of our service fee (affects break-even and how the fee is shown)

## 0. Foundations
- [x] Repo scaffold: Next.js + TypeScript + Postgres + Prisma (+ tRPC, Zod, Vitest — see [CLAUDE.md](../CLAUDE.md))
- [x] Auth: phone number + SMS code, triggered only at RSVP (real SMS provider not wired up yet — codes log to the server console locally, see the item below)
- [ ] Stripe account/keys wired up (test mode), incl. Connect
- [x] Background worker for time-based jobs (cut-off auto-confirm, event expiry) — `pnpm worker`, a single always-on interval process; payout release joins once §5 exists
- [ ] Web push setup (service worker, subscription storage)
- [ ] SMS/WhatsApp fallback provider wired up

## 1. Groups
- [x] Create group (name, description) → shareable `/g/{slug}` link
- [x] Join via group link, and auto-join on RSVP
- [x] Group page: list of events (`/g/{slug}` — upcoming/past, join CTA, organizer's "New game" link; no edit-group UI yet)
- [ ] Group admins model (one for MVP, many-ready) — schema only models one (`organizerId`); co-organizers not designed yet

## 2. Events
- [x] Create event (title, description, start + end time, location, cut-off, min default 1, optional max) — `/g/{slug}/events/new`, organizer only; no cost-breakdown editor in the form yet
- [x] Cost: total + optional display-only breakdown
- [x] Pricing modes: fixed per-head / split evenly (range shown before confirmation)
- [ ] Payment options (cash only / online only / both; online only after Stripe onboarding) and "Auto-charge at cut-off" toggle — only a `cashAllowed` boolean + `autoChargeAtCutoff` exist; no online option until Stripe/wallet land
- [x] Shareable `/e/{slug}` event link, viewable without an account
- [x] Duplicate event from a previous one — "Repeat this game" on the event page pre-fills the create form via `?from={slug}`, dates +7 days
- [x] Edit event: block price increases after first RSVP — `/e/{slug}/edit`, only while Open. Notifying RSVPers isn't built (§9); lowering max below headcount is blocked outright rather than moving anyone to a waitlist, since §6 isn't built yet

## 3. Confirmation & cut-off
- [x] Auto-confirm at cut-off (auto-charge on + min met) — `autoConfirmDueEvents`, run by the `pnpm worker` process every 60s
- [x] Manual confirm (any time)
- [x] Price lock at confirmation
- [x] Post-confirmation joins: immediate charge at locked price (drop-out allowed, no auto-refund) — cash only for now; wallet/card charging blocked on §5

## 4. RSVP flow
- [x] Public event page: spots left, price/range, cut-off, who's in (first name + last initial)
- [x] RSVP: phone + SMS code (first time) → cash (wallet/card blocked on §5)
- [x] Drop out: free before confirmation; after confirmation no auto-refund, organizer may refund (self-cancel only; organizer refund actions are §8)

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
- [x] States: Open / Confirmed / Cancelled / Expired — all four reachable
- [x] Cancel → full refunds including service fee, release holds — no refunds/holds needed yet since only cash RSVPs exist; revisit once §5 lands
- [x] Expire unconfirmed events 48h after start → release holds — `expireOverdueEvents`, run by `pnpm worker`; no holds to release yet (§5)

## 8. Organizer event list
- [x] Single list: attendance status + payment status + per-group no-show count (`/e/{slug}/manage`)
- [x] Mark attendance
- [x] Mark paid outside app — added `PAID_OUTSIDE_APP` to `PaymentStatus`, per the note in the UI spec
- [ ] Add walk-in (name only, doesn't count against max) — needs `Rsvp.userId` to become optional; not done yet
- [x] Dropped-out entries stay on the list marked "Dropped out" with their payment status (organizer can refund as usual)
- [x] Remove a player (pending confirmation) — no confirmation step in the UI yet, but the action itself is done
- [ ] Refund one / refund all online-paid (price only, service fee kept; until payout) — needs online payments (§5)

## 9. Notifications
- [ ] Trigger table from spec §9 wired to push
- [ ] SMS/WhatsApp fallback for money-related messages only
- [ ] Cut-off reminder job
- [ ] Organizer alert when cut-off passes unconfirmed (confirm anyway / cancel)
