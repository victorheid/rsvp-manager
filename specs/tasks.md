# MVP Task Tracker

Tracks implementation status against [`feature-spec-mvp.md`](./feature-spec-mvp.md). Update as work lands — check items off in the same PR that completes them.

## Blockers / decisions pending
- [ ] Legal check: does the wallet need an e-money licence or licensed partner? (blocks §5 wallet only)
- [ ] Accountant: VAT treatment of our service fee (affects break-even and how the fee is shown)

## 0. Foundations
- [x] Repo scaffold: Next.js + TypeScript + Postgres + Prisma (+ tRPC, Zod, Vitest — see [CLAUDE.md](../CLAUDE.md))
- [x] Auth: phone number + SMS code, triggered only at RSVP (real SMS provider not wired up yet — codes log to the server console locally, see the item below)
- [ ] Stripe account/keys wired up (test mode), incl. Connect — the `PaymentGateway` interface, in-memory fake and contract tests are built (`integrations/stripe`); what's left is the real adapter against Stripe test mode, which needs keys
- [x] Background worker for time-based jobs (cut-off auto-confirm, event expiry) — `pnpm worker`, a single always-on interval process; payout release joins once §5 exists
- [x] Web push setup (service worker, subscription storage) — `public/sw.js`, `PushSubscription` table, `notifications.subscribePush/unsubscribePush/sendTest`, `integrations/push` (real `web-push` sender once `VAPID_*` env keys are set, console logger otherwise). Entry point for now is the Home account menu ("Turn on notifications"); the `/me` screen and post-RSVP prompt (UI spec §9) come with §5
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
- [x] Fee schedules: versioned tiers (game card payments, top-ups), never edited in place — `fees` domain; v1 seeded by the migration, `publishFeeSchedule` adds a version (no UI/router: operator action)
- [x] Pin fee schedule version on event at creation; duplicates use current schedule — `Event.feeScheduleId`, set by `createEvent`
- [ ] Store exact fee charged on every payment
- [x] Wallet: balance, top-ups (€20 min / €50 / €100) + stepped top-up fee, €150 max balance — `wallet` domain, against the fake payment gateway (real Stripe pending keys; production refuses to run without a real gateway). Feature-flag the wallet in the UI until the legal check clears
- [x] Wallet holds (upper bound for split pricing), realized or released — `placeHold` / `realizeHold` / `releaseHold` / `chargeWalletNow`, race-safe; wiring them into RSVP, confirm and cancel comes with the wallet RSVP option
- [ ] Card RSVP: SetupIntent at RSVP, charge price + service fee at confirmation
- [ ] Failed charge → "owes" status + pay link
- [ ] Price + service fee display, and "save by topping up" prompt on card RSVP
- [ ] Wallet refund on request at full value; ID check for refunds over €50 (pending legal)
- [ ] Stripe Connect onboarding for organizers (only for events accepting online payment)
- [ ] Payout release after event (+2 days)

## 6. Waitlist
- [x] Join waitlist: "Notify me" only for now — "Auto-join and pay" needs wallet/card (§5), not built; no payment method picked, matching the spec's "notify me" behavior
- [ ] Ordering: auto-join entries first, then notify-me, first come first served within each; switching mode keeps join time — moot until auto-join exists; notify-me entries are ordered by join time
- [ ] Spot opens → auto-join next (skip if wallet can't cover it) — blocked on §5
- [x] Only notify-me entries left → notify all, first to claim wins (claim = normal RSVP, cash allowed) — no push/SMS to "notify all" (§9), but claiming works: first successful RSVP wins, the DB capacity check handles the race, and it clears their waitlist entry
- [x] Close waitlist at event start

## 7. Event lifecycle
- [x] States: Open / Confirmed / Cancelled / Expired — all four reachable
- [x] Cancel → full refunds including service fee, release holds — no refunds/holds needed yet since only cash RSVPs exist; revisit once §5 lands
- [x] Expire unconfirmed events 48h after start → release holds — `expireOverdueEvents`, run by `pnpm worker`; no holds to release yet (§5)

## 8. Organizer event list
- [x] Single list: attendance status + payment status + per-group no-show count (`/e/{slug}/manage`)
- [x] Mark attendance — default is "showed"; the organizer only marks no-shows (and can undo). Only offered once the game has started
- [x] Mark paid outside app — added `PAID_OUTSIDE_APP` to `PaymentStatus`, per the note in the UI spec; reversible via `undoMarkPaidOutsideApp` (the toast's Undo). Only offered once the game is confirmed
- [x] Add walk-in (name only, doesn't count against max) — `Rsvp.userId` is now optional with a `walkInName` fallback; hidden from the public event page's "Who's in" list, shown (tagged) on the manage screen
- [x] Dropped-out entries stay on the list marked "Dropped out" with their payment status (organizer can refund as usual)
- [x] Remove a player (pending confirmation) — confirmation sheet in the UI; only offered before the game starts (once it's running, not showing up is a no-show)
- [ ] Refund one / refund all online-paid (price only, service fee kept; until payout) — needs online payments (§5)

## 9. Notifications
- [x] Trigger table from spec §9 wired to push — new event, confirmed, details changed, cancelled, removed, spot open (notify-me). Still open: cut-off reminder and organizer alert (below), "moved in from waitlist", "payment failed", "refund issued" (need §5)
- [x] SMS/WhatsApp fallback for money-related messages only — `notifyUsers` also texts confirmed and cancelled (the money-related kinds today) via the SMS adapter; it's the console logger until a real provider exists (§0). Payment failed / refund / moved-in kinds join with §5
- [x] Cut-off reminder job — `sendCutoffReminders`, run by `pnpm worker`: 24h before cut-off, once per event, going + waitlist; skipped for games posted inside that window
- [x] Organizer alert when cut-off passes unconfirmed — `alertOrganizersOfUnconfirmedEvents`, run by `pnpm worker` after auto-confirm: once per event, push to the organizer linking to Manage. Copy offers "wait for more or cancel" when the minimum isn't met, since "confirm anyway" is still undecided (§10)

## 10. UI & design system
Design source: the Figma design system (Foundations, Components, Screens, Flows & Audit). Code: [`src/components/ui`](../src/components/ui/README.md), live at `/design`. Spec: [`ui-ux-spec-mvp.md`](./ui-ux-spec-mvp.md) §15.
- [x] Tokens: colour (Light + Dark), type, radius, elevation in `globals.css`, named to match the Figma variables; Nunito
- [x] Component kit: buttons, chips, banners, form fields, sheets, toasts, menus, list rows, cards (34 files, documented, gallery at `/design`)
- [x] All pages rebuilt on the kit: Home, Group, Event, Manage, Create/Edit event, Create/Edit group
- [x] Sign-in as a bottom sheet (phone → 6-digit code with auto-submit and resend timer → name), resuming the interrupted action
- [x] RSVP sheet (cash only for now), drop-out consequence sheet (before / after confirmation), confirm and cancel sheets on Manage
- [x] Share sheet (link, copy, WhatsApp, native share) on event, group and Manage; opens automatically after creating a group or game
- [x] Manage: one screen per phase (Open / Confirmed / Live / Finished), server-driven actions (`eventPhase`, `organizerEventActions`, `organizerRowActions`), informational rows with a ••• menu, filters with counts, toast + Undo
- [x] Create event: date leads; title, times, cut-off and details default from the last game and follow the date until edited (`events.suggestDefaults`); "Same as your last game" summary
- [ ] Mount the bottom `TabBar` (needs `/me` and Wallet)
- [ ] Wallet, top-up, `/me`, `/pay/{token}` screens (§5, §9; blocked on wallet legal check / Stripe)
- [ ] RSVP payment choice with wallet and card (needs §5); the sheet has only Cash today
- [ ] Refund and "Send pay link again" in the row menu (needs §5)
- [x] Section-level skeletons (`SectionSkeleton`, used on Home), sheet enter animation (no exit animation: native `<dialog>`), `ActionMenu` flip-up near the viewport bottom
- [ ] Decide: allow confirming below the minimum ("confirm anyway", UI spec §10.9)? `confirmEvent` currently refuses; the Manage screen disables the button and explains (UI spec open question 9)
- [x] Server-side guards for the phase rules — `markAttendance`, `markPaidOutsideApp` and `removeRsvp` check the action is in `organizerRowActions` for the event's current phase
