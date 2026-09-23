# MVP Task Tracker

Tracks implementation status against [`feature-spec-mvp.md`](./feature-spec-mvp.md). Update as work lands — check items off in the same PR that completes them.

## 0. Foundations
- [ ] Repo scaffold: Next.js + TypeScript + Postgres + Prisma
- [ ] Auth: phone number + SMS OTP
- [ ] Stripe account/keys wired up (test mode)
- [ ] Background job/queue for time-based triggers (waitlist expiry, deadline auto-confirm)
- [ ] Web push setup (service worker, subscription storage)
- [ ] SMS/WhatsApp fallback provider wired up

## 1. Groups
- [ ] Create group (name, description) → shareable `/g/{slug}` link
- [ ] Join group via link (no approval)
- [ ] Group page: list of events

## 2. Events
- [ ] Create event (title, description, date/time, location, min/max, RSVP deadline)
- [ ] Itemized cost builder → fixed-per-head or split-evenly pricing mode
- [ ] "Cash allowed" toggle
- [ ] "Auto-charge at deadline" toggle (default on)
- [ ] Shareable `/e/{slug}` event link
- [ ] Duplicate event from a previous one (recurring games)

## 3. RSVP flow
- [ ] Event page: spots left, price, deadline, RSVP list
- [ ] RSVP with choice: wallet / one-off card / cash-on-day
- [ ] Waitlist entry when full
- [ ] Self-cancel RSVP before confirmation

## 4. Payments & wallet
- [ ] Wallet balance model + top-up via Stripe (fixed amounts)
- [ ] Wallet hold at RSVP time, realized at confirmation, released on cancel (see spec's open design question)
- [ ] Card RSVP: SetupIntent at RSVP time, PaymentIntent capture at confirmation
- [ ] Fee display + "save by topping up" prompt on one-off card RSVP
- [ ] Wallet refund flow (blended average fee rate deduction)

## 5. Waitlist
- [ ] Promotion on spot opening (cancellation or max raised)
- [ ] 30-minute confirm window + notification
- [ ] Timeout/decline → advance to next person

## 6. Event lifecycle
- [ ] Open → Confirmed transition (auto at deadline, or manual)
- [ ] Open → Cancelled transition + full refund of prepaid RSVPs

## 7. Attendance & reliability
- [ ] Organizer marks attendance post-event
- [ ] Per-user reliability record (organizer-only visibility)

## 8. Notifications
- [ ] Push notification delivery (waitlist promotion priority case)
- [ ] SMS/WhatsApp fallback delivery

## 9. Organizer tools
- [ ] Edit/cancel event
- [ ] Manual confirm (pre- or post-deadline)
- [ ] Reliability history view per member
- [ ] `event_organizers` join table (single row for MVP, multi-organizer ready)

## 10. Post-confirmation reconciliation
- [ ] RSVP list view with per-person status (paid online / cash pending / cash settled / paid outside app)
- [ ] Add walk-in attendee (name only, no account) with payment status
- [ ] Mark existing RSVP as "settled outside app" (reconciliation flag, no money movement)
- [ ] Per-RSVP refund action (full refund, no fee)
- [ ] Bulk "refund all online-paid RSVPs" action
- [ ] Enforce price lock: no automatic recompute/re-charge on post-confirmation list edits
