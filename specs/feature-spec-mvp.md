# RSVP Manager — MVP Feature Spec

Status: aligned, ready for implementation planning.

## 1. Groups

- Top-level container (e.g. "Thursday Basketball Galway"). Every event belongs to exactly one group.
- Organizer creates a group, gets a shareable link: `app.com/g/{group-slug}`.
- Members join via that link — no approval flow for MVP, just "join the group".
- Group has: name, description, running list of events.
- Assumption: the join link does not expire and is not revocable/regeneratable in MVP. Organizer cannot remove members. Both are candidates for post-MVP.

## 2. Events

- Created within a group by the organizer.
- Fields: title, description, date/time, location, min players, max players, RSVP deadline.
- Pricing: organizer builds an itemized cost list (e.g. "Court booking – €80") and chooses one pricing mode:
  - **Fixed per-head** — set amount regardless of final headcount.
  - **Split evenly** — total cost ÷ final confirmed headcount, calculated at the moment the event is actually confirmed (see [Decisions](#decisions) — this can be later than the deadline if the organizer confirms manually). Once that first charge happens, the per-head price is **locked** — later edits to the list (walk-ins, no-shows, cash reconciliation) don't trigger automatic re-charges. See [Post-confirmation reconciliation](#10-post-confirmation-reconciliation).
- Toggle: **Cash allowed** — if on, RSVPers may choose to pay in person on the day instead of prepaying. Cash RSVPs still count toward min/max and toward the split-evenly headcount.
- Toggle: **Auto-charge at deadline** (default on) — if min is met when the deadline hits, all *prepaid* RSVPs (wallet or card) are charged and the event is confirmed. Cash RSVPs are untouched by auto-charge — they just remain as confirmed attendees expected to pay on the day. If min isn't met, or the toggle is off, the event stays open for the organizer to manage manually.
- Shareable unique link per event: `app.com/e/{event-slug}` — readable, easy to drop in WhatsApp.
- Organizer can create a new event pre-filled from a previous one (for recurring games).
- Currency: EUR only for MVP.

## 3. RSVP flow

- From the event link: spots left, price, deadline, current RSVP list are visible.
- At RSVP time, user chooses: pay with wallet, pay with one-off card, or pay cash on the day (if enabled).
- If the event is full, RSVP goes to the waitlist instead of the confirmed list.
- User can cancel their own RSVP any time before the event is confirmed.

## 4. Payments & wallet

- Each user has one global wallet balance, usable across any group/event.
- Top up in fixed amounts via card (Stripe).
- Wallet RSVP = instant, no processing fee. One-off card RSVP = fee shown transparently, with a prompt showing the savings of topping up instead.
- Wallet is refundable on request, minus the processing fee incurred on the original top-up.
- **Charges only fire when an event is actually confirmed** (min reached + auto-charge on, or organizer manually confirms) — never just for RSVPing.

## 5. Waitlist

- Kicks in once an event is full.
- When a spot opens (cancellation, or organizer raises max), the next person in line is notified and has 30 minutes to confirm.
- No response, or a decline, in that window → moves to the next person on the list.
- If the deadline passes under minimum, the event does not auto-cancel — it stays open; organizer can nudge the group or confirm manually once satisfied.

## 6. Event lifecycle

- **Open** — accepting RSVPs.
- **Confirmed** — auto-triggered at deadline (min met + auto-charge on) or manually triggered by organizer. Prepaid RSVPs are charged here. Confirmed is not terminal for list-editing purposes — organizer can keep managing the RSVP list (walk-ins, cash reconciliation, refunds) right up to and including the day of the event; see [Post-confirmation reconciliation](#10-post-confirmation-reconciliation).
- **Cancelled** — organizer-triggered at any point. All prepaid RSVPs auto-refunded in full, no fee to the RSVPer.

## 7. Attendance & reliability

- Post-event, organizer manually marks who showed up / no-showed.
- No refund is tied to no-show status — that's a separate, manual organizer decision.
- No-show history builds a per-user reliability record, visible only to organizers, used informally for waitlist promotion prioritization. No automation on this in MVP.

## 8. Notifications

- Push notifications are the primary channel — used especially for waitlist promotion (the 30-minute clock).
- Fallback to SMS/WhatsApp-style messaging for anything push can't reach.

## 9. Organizer tools

- Create/edit/cancel events.
- Manually confirm an event, before or after deadline.
- Mark attendance post-game.
- View reliability history per member (organizer-only).
- One organizer per event for MVP, but the data model should allow multiple in future (i.e. model as an `event_organizers` join, populated with one row for now, not a single `organizer_id` column).
- Post-confirmation RSVP list management — see below.

## 10. Post-confirmation reconciliation

Organizer needs to keep working the RSVP list on the day, even after the event is confirmed (and possibly already auto-charged):

- **Add a walk-in** — a lightweight attendee record for someone who never RSVP'd through the link (name only, no account required), tagged with a payment status.
- **Mark a payment as settled outside the app** — for any RSVP (cash-on-day, or someone who paid the organizer directly some other way), a reconciliation flag the organizer sets. This never moves money in-app, it's just record-keeping.
- **Refunds are manual, not automatic.** Editing the list (removing a no-show, changing headcount) does **not** trigger a recalculated split or an automatic re-charge/refund — the per-head price is already locked (see [Events](#2-events)). Instead, the organizer works from a simple RSVP list view with:
  - a refund action per individual RSVP, and
  - a bulk action to refund all online-paid (wallet/card) RSVPs at once.
- Refunds issued through this flow are full refunds with no fee to the RSVPer (same rule as event cancellation in [Event lifecycle](#6-event-lifecycle)) — since the change is organizer-driven, not a wallet cash-out request. Refund lands back on wallet or original card depending on how the RSVP was paid.

## Out of scope for MVP

Multi-sport categorization, UK/US payment support, co-organizers, cross-waitlist conflict checking, self-reported no-shows, automated reliability-based sorting.

---

## Decisions

Resolved while aligning on this spec, kept here so the "why" doesn't get lost:

1. **Waitlist promotion + insufficient funds/no action** → treated as a decline. If a promoted person doesn't have wallet balance to cover it and doesn't act within 30 minutes, they're skipped exactly like a decline — no extended grace window for a card top-up in MVP.
2. **Auto-charge with mixed cash/prepaid RSVPs** → auto-charge only touches prepaid (wallet/card) RSVPs. Cash RSVPs never block or get touched by auto-charge; the event confirms as long as min is met.
3. **Split-evenly timing** → recalculated at the actual confirmation moment (deadline for auto-confirm, or whenever the organizer manually confirms), using headcount at that moment — not frozen at the original deadline.
4. **Auth** → phone number + SMS OTP. Phone number is a first-class field anyway (SMS/WhatsApp fallback needs it), and it fits the "share a link in WhatsApp" flow better than email.
5. **Platform** → mobile web / PWA, not a native app. Matches the frictionless link-join flow (`app.com/g/...`) — no app-store install required before joining a group. Means "push notification" = Web Push, which has lower delivery reliability than native push; this is part of why the SMS/WhatsApp fallback exists.
6. **Wallet refund fee calculation** → blended average fee rate. The wallet tracks a running weighted-average fee rate across top-ups rather than a FIFO ledger of individual top-ups. Refund amount × average rate = fee withheld. Simpler for MVP; revisit if users start gaming top-up timing.
7. **Stack** → Next.js (React, full-stack) + Postgres + Prisma, Stripe for payments, a background worker/queue for time-based triggers (waitlist 30-min expiry, deadline auto-confirm). Chosen for a fresh repo needing web push, a queue, and Stripe integration with minimal infra overhead.
8. **Split-evenly price locks at first charge** → once auto-charge or manual confirm fires the first charge, the per-head price is frozen. Later list edits (walk-ins, no-shows) don't recompute or re-charge anyone automatically — keeps the money-movement logic predictable and avoids surprise re-charges to cards/wallets hours after people thought they were done.
9. **Post-confirmation corrections are manual, refund-only** → rather than an automatic true-up engine, the organizer gets a simple RSVP list view with per-person and bulk ("refund all online-paid") refund actions. No mechanism auto-charges someone more after the fact — only refunds, and only when the organizer chooses to issue them. External payments (cash collected, paid outside the app) and walk-ins are recorded as reconciliation flags/lightweight records, not real charges.

## Open design question — surfaced during spec review, needs a call

**When is money actually moved for a wallet or card RSVP, given "charges only fire at confirmation"?**

The spec is explicit that RSVPing never charges anyone — only confirmation does. That means at RSVP time we can't simply deduct wallet balance or capture a card charge; we need a *hold* that's realized only at confirmation and released on cancellation/event-cancellation. Proposed default, pending your confirmation:

- **Wallet RSVP** → place a hold that reduces "available to spend" immediately (prevents double-spending the same balance across multiple pending RSVPs), but doesn't move money. Realized (deducted) at confirmation; released back to available balance if the RSVP or event is cancelled first.
- **Card RSVP** → save the payment method at RSVP time (Stripe SetupIntent), charge it (PaymentIntent) only at confirmation. (A Stripe pre-auth/capture flow doesn't work here because holds expire — typically within 7 days — and the window between RSVP and confirmation/deadline can be longer.)

Flagging this explicitly because it's a real architectural decision, not a detail — happy to proceed with the above unless you want it different.

## Other assumptions worth flagging (not blocking, easy to revisit)

- Event date/times are stored as proper timestamps with timezone; no multi-timezone UI needed for MVP (single-region use case per the example).
- Min/max headcount includes the organizer if they RSVP like anyone else — no special exemption.
- No push token / OTP delivery provider chosen yet (e.g. Twilio for SMS/WhatsApp, web-push for Push) — to be picked during implementation, not a spec-level decision.
