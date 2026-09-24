# MVP Task Tracker

Tracks implementation status against [`feature-spec-mvp.md`](./feature-spec-mvp.md). Update as work lands — check items off in the same PR that completes them.

## Blockers / decisions pending
- [ ] Legal check: does the wallet need an e-money licence or licensed partner? (blocks §5 wallet only)
- [ ] Accountant: VAT treatment of our service fee (affects break-even and how the fee is shown)

### Pending from Tech Lead
Everything else that can be built without these is built (against fakes). These need a person to act or decide:
- [x] Stripe webhooks, local: `STRIPE_WEBHOOK_SECRET` from `stripe listen --events payment_intent.succeeded,payment_intent.payment_failed,account.updated --forward-to localhost:3000/api/stripe/webhook` — verified 24 Sep: test events answered 200 (platform and connect), and a wallet top-up with the tab closed was credited
- [ ] Stripe webhooks, production: add a dashboard endpoint (`/api/stripe/webhook`) for `payment_intent.succeeded`, `payment_intent.payment_failed`, `account.updated`, and set its secret as `STRIPE_WEBHOOK_SECRET`
- [ ] Try Connect onboarding by hand in the browser (organizer → event form → "Set up payouts") with Stripe's test data, then a payout
- [ ] Pick an SMS/WhatsApp provider (Twilio or similar) and provide an account, to replace the console SMS sender
- [ ] Decide: allow confirming below the minimum ("confirm anyway", UI spec §10.9)? Today `confirmEvent` refuses and the organizer alert says "wait for more, or cancel"
- [ ] Design: group admins / co-organizers (schema has one `organizerId`; every organizer check would change)
- [ ] Wallet refund on request at full value, and the ID check for refunds over €50 — waits on the legal check above
- [ ] Pick an email provider (Resend, Postmark or similar) and provide an account, to replace the console email sender used for verification codes
- [ ] Generate VAPID keys and set the `VAPID_*` and `APP_URL` env vars (`.env.example`) to enable real web push and SMS links
- [ ] Set `WALLET_ENABLED=true` in production only once the legal check clears (off by default there)
- [ ] Click through the payment UI signed in (RSVP with wallet/card, waitlist sheet, `/wallet`, `/pay/{token}`, payout setup) using the test-mode card form: only the server side has automated tests

## 0. Foundations
- [x] Repo scaffold: Next.js + TypeScript + Postgres + Prisma (+ tRPC, Zod, Vitest — see [CLAUDE.md](../CLAUDE.md))
- [x] Auth: phone number + SMS code, triggered only at RSVP (real SMS provider not wired up yet — codes log to the server console locally, see the item below)
- [x] Stripe account/keys wired up (test mode), incl. Connect — real `PaymentGateway` (`integrations/stripe/real.ts`, used whenever `STRIPE_SECRET_KEY` is set), Stripe Elements in `CardForm`, and `pnpm test:stripe` runs the shared contract + the card/top-up flows against the sandbox. Verified by hand: sandbox wallet top-up with Stripe Elements and the webhook. Not yet verified by hand: Connect onboarding in the browser and a payout (needs an onboarded account and platform funds). Webhooks: `/api/stripe/webhook` (signature-checked; `webhooks` domain) settles top-ups and pay-link payments if the browser closed early, and refreshes payout status on `account.updated`
- [x] Background worker for time-based jobs (cut-off auto-confirm, event expiry) — `pnpm worker`, a single always-on interval process; payout release now included
- [x] Web push setup (service worker, subscription storage) — `public/sw.js`, `PushSubscription` table, `notifications.subscribePush/unsubscribePush/sendTest`, `integrations/push` (real `web-push` sender once `VAPID_*` env keys are set, console logger otherwise). Entry point for now is the Home account menu ("Turn on notifications"); the `/me` screen and post-RSVP prompt (UI spec §9) come with §5
- [ ] SMS/WhatsApp fallback provider wired up

### Sign-in codes: cost, fraud and channel
Decision: keep phone as the player identity; SMS is the default code channel, WhatsApp can join later. Launch market Ireland, realistically anywhere in Europe. Codes are the main messaging cost (roughly €0.08–0.15 each by SMS, about €0.05 by WhatsApp; verify against provider rate cards).
- [ ] Get Ireland/EU quotes from Twilio (Verify + SMS), Bird/MessageBird, Sinch or Infobip, and pick one for the MVP (see the provider item in Pending from Tech Lead)
- [ ] Use Twilio Verify (or the chosen provider's equivalent) for sign-in codes instead of our own OTP, for its fraud guard
- [ ] Rate-limit code requests per phone number, per IP and globally (the 5-attempt limit on wrong codes exists; requests are a separate limit)
- [ ] Country allow-list: only send codes to the countries we serve, and block premium and high-fraud prefixes
- [ ] Daily spend alert and cap on the messaging provider account (SMS pumping is the main cost risk)
- [ ] Make the code channel pluggable: turn `SmsSender` into a `CodeSender` with a channel field (SMS today, WhatsApp later) so domain code doesn't change
- [ ] WhatsApp as the preferred code and money-fallback channel: Meta business verification, template approval (authentication and utility), WhatsApp adapter, SMS fallback when the number isn't on WhatsApp
- [ ] "Didn't get the code? Send it by WhatsApp" fallback on the sign-in sheet, if delivery complaints show up
- [ ] Passkeys as a returning-login shortcut — optional, after the MVP

## 0b. Identity: players vs organizers
Decision: players sign in with a phone number alone; anyone who organizes needs a verified email too (a recovery and confirmation channel for lost, changed or recycled numbers).
- [x] One name field (full name or nickname) instead of first name + last initial — `User.name`
- [x] Verified email for organizers — required to create a group or game and to set up payouts; verify with a code (`VerifyEmailSheet`); replacing it alerts the old address and the phone
- [x] Change phone number in place (same account, so groups, wallet and cards follow) — SMS code to the new number, plus an email code for accounts with a verified email; the old number and email are told. `/me` has Phone and Email sections
- [x] Fix: wrong sign-in codes were never counted (the increment rolled back with the transaction), so the 5-attempt limit didn't bite
- [ ] Email provider (Resend/Postmark or similar) — emails are logged to the server console until then (see Pending from Tech Lead)
- [ ] Step-up: ask for a fresh code before money-moving actions (large top-up, wallet cash-out, payout setup) — not built
- [ ] Recovery for someone who lost both the old number and the email — support-assisted for the MVP; write down the process
- [ ] Periodic re-verification of idle accounts holding a wallet balance (recycled-number risk) — optional

## 1. Groups
- [x] Create group (name, description) → shareable `/g/{slug}` link
- [x] ~~Join via group link, and auto-join on RSVP~~ replaced by invite links (below)
- [x] Group page: list of events (`/g/{slug}` — upcoming/past, organizer's "New game" link)

### Invite links, members, members-only games (2026-09-24)
Decision: groups are invite-only (feature spec §1, decision 21). RSVPing no longer joins the group; each game has an "Open to non-members" switch.
- [x] Invite link separate from the group URL: `/g/{slug}/join/{token}`, expiry never / 24h / 7d / 30d, new link, stop invites — `Group.inviteToken` / `inviteExpiresAt`, `updateInviteLink`, `stopInviteLink`, rules `inviteLinkStatus` / `inviteState`
- [x] Members-only group page (outsiders see the name and whom to ask), invite page with Join
- [x] Members page `/g/{slug}/members`: list, phone numbers for the organizer, remove member, leave group — `getGroupMembers`, `removeMember`, `leaveGroup`, rules `memberRowActions` / `canLeaveGroup`
- [x] Per-game "Open to non-members" (default off, copied from the last game); RSVP and waitlist check `joinProblem`; the event page's bar says "Group members only"
- [ ] Hide members-only games' details from outsiders? The event page is still public (link previews in WhatsApp); only joining is gated
- [ ] Group admins model (one for MVP, many-ready) — schema only models one (`organizerId`); co-organizers not designed yet

## 2. Events
- [x] Create event (title, description, start + end time, location, cut-off, min default 1, optional max) — `/g/{slug}/events/new`, organizer only; no cost-breakdown editor in the form yet
- [x] Cost: total + optional display-only breakdown
- [x] Pricing modes: fixed per-head / split evenly (range shown before confirmation)
- [x] Payment options (cash only / online only / both; online only after Stripe onboarding) and "Auto-charge at cut-off" toggle — `Event.onlineAllowed` next to `cashAllowed`, validated by `paymentOptionsProblem` on create and edit. Form UI still to do
- [x] Shareable `/e/{slug}` event link, viewable without an account
- [x] Duplicate event from a previous one — "Repeat this game" on the event page pre-fills the create form via `?from={slug}`, dates +7 days
- [x] Edit event: block price increases after first RSVP — `/e/{slug}/edit`, only while Open. Notifying RSVPers isn't built (§9); lowering max below headcount is blocked outright rather than moving anyone to a waitlist, since §6 isn't built yet

## 3. Confirmation & cut-off
- [x] Auto-confirm at cut-off (auto-charge on + min met) — `autoConfirmDueEvents`, run by the `pnpm worker` process every 60s
- [x] Manual confirm (any time)
- [x] Price lock at confirmation
- [x] Post-confirmation joins: immediate charge at locked price (drop-out allowed, no auto-refund) — cash only for now; wallet/card charging blocked on §5

## 4. RSVP flow
- [x] Public event page: spots left, price/range, cut-off, who's in (by name)
- [x] RSVP: phone + SMS code (first time) → cash (wallet/card blocked on §5)
- [x] Drop out: free before confirmation; after confirmation no auto-refund, organizer may refund (self-cancel only; organizer refund actions are §8)

## 5. Payments, wallet & payouts
- [x] Fee schedules: versioned tiers (game card payments, top-ups), never edited in place — `fees` domain; v1 seeded by the migration, `publishFeeSchedule` adds a version (no UI/router: operator action)
- [x] Pin fee schedule version on event at creation; duplicates use current schedule — `Event.feeScheduleId`, set by `createEvent`
- [x] Store exact fee charged on every payment — `Payment.feeCents` + `feeScheduleId`, written when the payment is created and never recalculated (a pay link re-uses it)
- [x] Wallet: balance, top-ups (€20 min / €50 / €100) + stepped top-up fee, €150 max balance — `wallet` domain, against the fake payment gateway (real Stripe pending keys; production refuses to run without a real gateway). Feature-flag the wallet in the UI until the legal check clears
- [x] Wallet holds (upper bound for split pricing), realized or released — `placeHold` / `realizeHold` / `releaseHold` / `chargeWalletNow`, race-safe; wiring them into RSVP, confirm and cancel comes with the wallet RSVP option
- [x] Card RSVP: SetupIntent at RSVP, charge price + service fee at confirmation — `rsvps.beginCardSetup` → `rsvps.create` with the SetupIntent; charged after commit at confirmation (or at once when joining a confirmed event). Also wallet RSVPs: hold at RSVP, realized at confirmation, released on drop / cancel / expiry, refunded onto the balance if a confirmed event is cancelled. Against the fake gateway
- [x] Failed charge → "owes" status + pay link — decline, expired card, insufficient funds and 3-D Secure all end as OWES with a `/pay/{token}` link (push + SMS); `payments.owed / startOwedPayment / completeOwedPayment` back the page. Page UI not built yet
- [x] Price + service fee display, and "save by topping up" prompt on card RSVP — event page fee line, RSVP sheet totals (`event.cardFeeCents`), and a "pay from your wallet to skip it" hint
- [ ] Wallet refund on request at full value; ID check for refunds over €50 (pending legal)
- [x] Stripe Connect onboarding for organizers (only for events accepting online payment) — `payouts` domain: start / refresh / status, against the fake gateway. UI for it comes with the create-event form
- [x] Lighter onboarding: the connected account is created as an individual with the industry (MCC 7997), a product description, email and phone prefilled, and the link asks only for `currently_due` fields, so Stripe skips "what does your business do". ID, address and bank details are still asked (legally required). Check by hand in the sandbox (item in Pending from Tech Lead)
- [x] Payout release after event (+2 days) — `releaseDuePayouts`, run by `pnpm worker`: full price of online payments less refunds, once per event, waits for onboarding. Against the fake gateway

## 6. Waitlist
- [x] Join waitlist: "Notify me" (no payment method) or "Auto-join and pay" (wallet, or a card saved now; online events only) — `waitlist.join` / `waitlist.setMode`
- [x] Ordering: auto-join entries first, then notify-me, first come first served within each; switching mode keeps join time — `sortWaitlist`
- [x] Spot opens → auto-join next (skip if wallet can't cover it) — `promoteFromWaitlist` on drop-out / removal, and a worker sweep for raised max; moved-in and skipped notifications
- [x] Only notify-me entries left → notify all, first to claim wins (claim = normal RSVP, cash allowed) — no push/SMS to "notify all" (§9), but claiming works: first successful RSVP wins, the DB capacity check handles the race, and it clears their waitlist entry
- [x] Close waitlist at event start

### List-first event page and per-event waitlist mode
Decision (2026-09-24): replace the per-person auto-join / notify-me choice with one waitlist mode per event, **in order** (default: the spot is held for #1 for the event's hold time, 1h default; expired hold → end of the list; no hold if it would run past start) or **first to claim**. The event page leads with the list, and organizers can mark anyone dropped out, waitlisters included. Supersedes the auto-join items above. See feature spec §6, §8 and decisions 8 and 20, UI spec §4, §7.2–7.3, §10.3, §10.5.
- [x] Schema: `waitlistMode` (IN_ORDER / FIRST_TO_CLAIM, default IN_ORDER) and `waitlistHoldMinutes` (default 60) on `Event`; `heldUntil` on `WaitlistEntry`; a dropped-out state for waitlist entries so they show under Dropped out; retire `promotionMode`, `paymentMethod` and the saved-card fields on `WaitlistEntry` (migrate existing entries to plain ones)
- [x] Rules in `waitlist/rules.ts`, table-tested (`planWaitlist`, `holdEndsAt`, `spotsHeldForOthers`, `organizerWaitlistRowActions`): order by join time, who gets the next hold, hold end time (none if it would pass start), expired hold → end of the list (a new join time), held spots count against max but not towards min
- [x] Actions: hold spots when they open (drop-out, marked dropped out, max raised); take a held/open spot through the normal RSVP (rejects after the hold ends, never charges after expiry); leave waitlist (passes a hold on); worker sweep for expired holds; replace `promoteFromWaitlist` / auto-join and remove `setWaitlistMode` — `advanceWaitlist` / `advanceWaitlists` (worker). Someone whose hold ran out isn't held a spot again (they can still take an open one), so a spot never sits on someone who doesn't answer
- [x] Organizer "Mark as dropped out" on Going and Waitlist rows, before start only — `rsvps.markDroppedOut` (was `remove`) and `waitlist.markDroppedOut`; Manage shows the waitlist in order with the row menu, and waitlist drop-outs under Dropped out
- [x] Event form: waitlist mode and hold time (§10.3), editable in Edit event; changing mode leaves running holds alone — `waitlistMode` / `waitlistHoldMinutes` on create/edit, copied into "same as last game" (summary line + Waitlist section, shown when there's a max)
- [x] Event page list-first layout: viewer status in the bottom bar (held spot with Take the spot / Leave waitlist and the hold end time; StickyActionBar gets a status row), In / Waitlist (numbered) / Dropped out, viewer's row highlighted — `ViewerActionBar`; organizer actions stay on Manage for now (the event page links there) rather than a ••• menu on each public row
- [x] Join waitlist becomes one tap (drop the mode and payment step from the waitlist sheet)
- [x] Notifications: "spot held for you" and "spot open" (first to claim) replace moved-in, skipped and notify-me kinds; "removed" becomes "marked as dropped out"
- [x] Figma first: event page list-first, held-spot banner, waitlist settings in the event form

## 7. Event lifecycle
- [x] States: Open / Confirmed / Cancelled / Expired — all four reachable
- [x] Cancel → full refunds including service fee, release holds — `cancelEvent` releases wallet holds and refunds every online payment (fee included), including people who dropped out after paying
- [x] Expire unconfirmed events 48h after start → release holds — `expireOverdueEvents`, run by `pnpm worker`; releases wallet holds

## 8. Organizer event list
- [x] Single list: attendance status + payment status + per-group no-show count (`/e/{slug}/manage`)
- [x] Mark attendance — default is "showed"; the organizer only marks no-shows (and can undo). Only offered once the game has started
- [x] Mark paid outside app — added `PAID_OUTSIDE_APP` to `PaymentStatus`, per the note in the UI spec; reversible via `undoMarkPaidOutsideApp` (the toast's Undo). Only offered once the game is confirmed
- [x] Add walk-in (name only, doesn't count against max) — `Rsvp.userId` is now optional with a `walkInName` fallback; hidden from the public event page's "Who's in" list, shown (tagged) on the manage screen
- [x] Dropped-out entries stay on the list marked "Dropped out" with their payment status (organizer can refund as usual)
- [x] Remove a player (pending confirmation) — confirmation sheet in the UI; only offered before the game starts (once it's running, not showing up is a no-show)
- [x] Refund one / refund all online-paid (price only, service fee kept; until payout) — `rsvps.refund` / `rsvps.refundAll`, driven by the `REFUND` row action and `REFUND_ALL` menu action; Manage screen has both with confirmation sheets. A worker sweep retries cancellation refunds the provider rejected

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
- [x] Mount the bottom `TabBar` — Games / Wallet (while enabled) / Me, on the three top-level screens
- [x] `/me`, Wallet (`/wallet`, top-up) and `/pay/{token}` are built against the fake gateway, behind the `WALLET_ENABLED` flag (off in production until the legal check clears). The card step is a test-mode stand-in (`CardForm`) that becomes Stripe Elements
- [x] RSVP payment choice with wallet and card — RSVP sheet (wallet / card / cash by what the game allows), waitlist sheet (auto-join vs notify me), organizer's "Wallet and card" toggle + payout setup in the event form
- [x] Refund and "Send pay link again" in the row menu — both server-driven row actions with Manage UI
- [x] Section-level skeletons (`SectionSkeleton`, used on Home), sheet enter animation (no exit animation: native `<dialog>`), `ActionMenu` flip-up near the viewport bottom
- [ ] Decide: allow confirming below the minimum ("confirm anyway", UI spec §10.9)? `confirmEvent` currently refuses; the Manage screen disables the button and explains (UI spec open question 9)
- [x] Server-side guards for the phase rules — `markAttendance`, `markPaidOutsideApp` and `removeRsvp` check the action is in `organizerRowActions` for the event's current phase
