# RSVP Manager — MVP Feature Spec

Status: aligned, with open questions listed at the end. Guiding principle: **simple to join and use**. Anyone with a link can see an event, and joining takes a phone number and one tap.

## 1. Groups

- A group is the top-level container (e.g. "Thursday Basketball Galway"). Every event belongs to exactly one group.
- Organizer creates a group and gets a shareable link: `app.com/g/{group-slug}`.
- People join via the group link, or automatically by RSVPing to any of the group's events. No approval flow.
- Group has: name, description, list of events.
- Membership gives you: the group's event list, and a notification when a new event is posted.
- **Organizers are group admins**, and events inherit them from their group. One admin per group for MVP; the data model allows several (future co-organizers).
- The join link doesn't expire and can't be revoked in MVP, and organizers can't remove members. Both are post-MVP.

## 2. Events

- Created within a group by an organizer.
- Fields: title, description, date/time, location, **cut-off**, min players (default 1), max players (optional; empty means unlimited).
- Cost: a total amount, with an optional itemized breakdown (e.g. "Court booking – €80"). The breakdown is for display only; no logic depends on it.
- Pricing mode:
  - **Fixed per-head**: a set amount regardless of headcount.
  - **Split evenly**: total ÷ headcount at confirmation (cash RSVPs count). Before confirmation the price is shown as a range, from total ÷ max (full event) up to total ÷ min, or "up to total ÷ min" if there's no max.
- **Price lock**: the per-head price is fixed the moment the event is confirmed and never recalculated after that. Later joiners pay the locked price. Headcount changes after that (no-shows, walk-ins) are handled with manual refunds (§8), never with automatic re-charges.
- Toggle **Cash allowed**: RSVPers may choose to pay in person on the day. Cash RSVPs count toward min/max like any other.
- Toggle **Auto-charge at cut-off** (default on): see §3.
- Shareable link per event: `app.com/e/{event-slug}`, readable and easy to drop in WhatsApp.
- Organizer can create a new event pre-filled from a previous one (recurring games).
- Currency: EUR only.

### Editing an event after people have RSVP'd

- Changes to date/time, location or price notify everyone who's in or on the waitlist.
- The price (fixed amount or split total) **can't go up** once anyone has RSVP'd. It can go down. This avoids re-checking wallet holds and saved cards against a higher amount.
- Lowering max below the current headcount moves the most recent RSVPs to the front of the waitlist.

## 3. Confirmation and cut-off: the one rule

What users need to know: **until the game is confirmed you can drop out for free. Once it's confirmed you're in and paying.**

- **Before confirmation**: join or leave freely; nothing is charged.
- **At cut-off**: if auto-charge is on and min is met, the event is confirmed automatically and prepaid RSVPs (wallet/card) are charged. Cash RSVPs are untouched and owe on the day. If min isn't met or auto-charge is off, the event stays open.
- **Manual confirm**: the organizer can confirm at any time, before or after cut-off. The effect is the same as auto-confirm.
- **After confirmation**: people can still join while spots remain, up to the event start. They're charged immediately at the locked price and can't self-cancel.

The cut-off is the auto-confirm moment, not an RSVP deadline.

## 4. RSVP flow

- **No account needed to view.** From the event link anyone sees: spots left, price (or range), cut-off, and who's in (first name + last initial).
- Tapping RSVP asks for phone number + SMS code (first time only), then a payment choice: wallet, one-off card, or cash on the day (if allowed).
- RSVPing automatically joins the group.
- If the event is full, the RSVP goes to the waitlist (§6).
- Self-cancel is allowed any time before confirmation.

## 5. Payments, wallet and payouts

### Charging
- **Nobody is charged just for RSVPing.** Charges fire at confirmation, or immediately when joining an already-confirmed event.
- **Wallet RSVP**: a hold is placed on the balance at RSVP time. It reduces available balance but moves no money. The hold is realized at confirmation, or released if the RSVP or event is cancelled first. For split pricing, the hold is the upper bound (total ÷ min), and the difference is released at confirmation.
- **Card RSVP**: the card is saved at RSVP time (Stripe SetupIntent) and charged (price + service fee) at confirmation. A pre-authorization hold isn't used because those expire before a typical cut-off.
- **Failed card charge** (expired card, bank asks for 3D Secure): the person is marked **owes**, gets a pay link, and shows up as owing in the organizer's list (§8), exactly like unpaid cash.

### Service fees (platform revenue)
- The platform charges a **service fee on every card payment** that goes through it, paid by the player **on top of** the price (e.g. "€8.00 + €0.50 service fee = €8.50"). The organizer receives the full price. The fee covers Stripe's processing fee, and the platform keeps the rest.
- Fee on each card payment for a game (MVP): **€0.50 flat**. Stepped by amount later (e.g. €0–10 → €0.50, …).
- Fee on wallet top-ups: **stepped by amount, starting at €1** (€20 → €1, €50 → €1.50, €100 → €2.50), paid on top (pay €21, get €20).
- **No service fee on game payments made from the wallet**, since the top-up fee already covers it. **No fee on cash or paid-outside-app payments** (no money goes through the platform).
- **Service fees are non-refundable**, with one exception: when the organizer **cancels a confirmed event**, players also get the service fee back and the platform absorbs Stripe's cost. Stripe keeps its own processing fee on refunds, so refunding our fee would otherwise always cost us money. Players can't drop out once charged, so every other refund is organizer-initiated.
- For split pricing, the fee is worked out from the locked price at the moment of charging.

#### Changing fees without affecting past or ongoing events
- Fees live in **fee schedules** (tiers by amount, for game payments and top-ups) that are versioned and **never edited in place**. A change means publishing a new schedule version with an effective date.
- Each event records the schedule version live when it was **created**, and every payment for that event uses it (including late joins and waitlist promotions), even if a newer schedule has been published since.
- Duplicating an event ("create from previous") uses the **current** schedule, not the original's.
- Top-ups use the schedule live at the time of the top-up.
- Every payment stores the exact fee amount charged; it's never recalculated.

### Wallet
- One global balance per user, usable across any group or event.
- Top up via card in fixed amounts: **€20 (minimum) / €50 / €100**, plus the top-up service fee. **Max balance: €150**, and a top-up that would exceed it is blocked. See [Wallet limits](#wallet-limits--research-notes) for why.
- Game payments from the wallet carry no service fee. When someone pays for a game by card, the prompt shows what they'd save by topping up instead (e.g. €0.50 per game by card vs ~€0.20–0.40 per game via the wallet).
- **Refundable on request at full value.** The top-up fee was already paid on top, so no deduction is needed.

### Organizer payouts
- Organizers receive money via Stripe Connect. Before their first event that accepts online payments, they complete Stripe onboarding (ID + bank details). **Cash-only events need no onboarding.**
- Payout is released **after the event date has passed** (proposed: +2 days). That leaves time to handle refunds and fixes before money leaves the platform.
- In-app refunds are available until payout. After payout, any refund is between organizer and player, outside the app.

## 6. Waitlist

- Kicks in once the event is full.
- On joining the waitlist, the user picks a payment method like a normal RSVP, plus an **"Auto-promote me"** checkbox (on by default). The copy makes two things clear: that they'll be moved in automatically when a spot opens, and that auto-promote entries get priority.
- **Order**: auto-promote entries first, then manual entries; first come, first served within each. A user can toggle their choice at any time and keeps their original join time.
- When a spot opens (a cancellation, a raised max, or an organizer removing someone):
  - **Auto-promote entry available** → the next one is moved in and notified. Normal rules apply: they can drop out free before confirmation, or are charged immediately if the event is already confirmed. If they chose wallet and their balance can't cover the hold, they're skipped and notified.
  - **Only manual entries left** → all of them are notified that a spot is open, and the first to claim it gets it. No timer.
- The waitlist closes when the event starts.

## 7. Event lifecycle

- **Open**: accepting RSVPs, nothing charged.
- **Confirmed**: auto (cut-off + min met + auto-charge on) or manual. Prepaid RSVPs are charged and the price is locked. People can still join while spots remain (§3).
- **Cancelled**: organizer-triggered at any point before payout. All online payments are refunded in full, **including the service fee**. Holds are released and saved cards are never charged.
- **Expired**: an Open event that is still unconfirmed 48h after its start time. Holds are released and nobody is charged. The 48h gives the organizer time to confirm after the fact (e.g. charging after the game).

## 8. Organizer event list

Attendance, reconciliation and refunds all happen on **one screen per event**. Each person has:

- **Attendance**: unmarked / showed / no-show.
- **Payment**: held (not charged yet) / paid online / owes (cash due or failed card) / paid outside app / refunded.
- **No-show count** for this group, shown next to their name.

Actions:
- Confirm or cancel the event.
- Mark attendance (after the event).
- Mark a payment as **paid outside app** (cash collected, bank transfer, etc.). This is record-keeping only; no money moves.
- **Add a walk-in**: a name-only record (no account) with a payment status. Walk-ins don't count against max.
- **Refund one person**, or **refund all online-paid** in bulk. The price is refunded in full, back to the original method (wallet or card), and refunds are available until payout (§5). The service fee is not refunded; only cancelling the event refunds it.

### Reliability
- No-show count is **per group** and visible only to that group's organizers, never to the player or to other groups.
- It's informational only; nothing (waitlist order, refunds) is automated from it.

## 9. Notifications

- **Web push** is the primary channel. **SMS/WhatsApp** is the fallback, used only for money-related messages (charged, payment failed, cancelled/refunded, moved in from waitlist) to keep costs down.
  - On iPhone, web push only works if the user has added the app to their Home Screen, so many iPhone users will only receive the fallback messages.
- With auto-promotion there are no countdown timers, so nothing depends on near-instant delivery.

Triggers:
| Trigger | Who |
|---|---|
| New event posted | Group members |
| Cut-off reminder (e.g. 24h before) | Everyone in, and waitlist |
| Moved in from waitlist | Promoted person |
| Spot open (manual waitlist) | Manual waitlist entries |
| Event confirmed + amount charged | Everyone in |
| Event details changed | Everyone in, and waitlist |
| Event cancelled + refund | Everyone in, and waitlist |
| Payment failed + pay link | That person |
| Refund issued | That person |

## Out of scope for MVP

Multi-sport categorization, UK/US payment support, co-organizers (data model ready, no UI), cross-waitlist conflict checking, self-reported no-shows, automated reliability-based sorting, revocable group links, removing members, wallet-to-wallet transfers.

---

## Decisions

Kept here so the "why" doesn't get lost.

1. **Auth: phone + SMS code, only at RSVP.** A phone number is needed for the SMS/WhatsApp fallback anyway, and it fits the "link in WhatsApp" flow. Browsing needs no account.
2. **Platform: mobile web / PWA.** No app-store install before joining; web push instead of native push.
3. **Stack: Next.js + Postgres + Prisma + Stripe (incl. Connect), plus a background worker** for cut-off auto-confirm, expiry and payouts.
4. **Confirmation is the single pivot** (§3). The cut-off only triggers auto-confirm. Joining stays open after confirmation, with an immediate charge at the locked price.
5. **Split pricing: range before confirmation, locked at confirmation.** The wallet hold is the upper bound. Never recalculated after lock.
6. **Auto-charge only touches prepaid RSVPs.** Cash never blocks confirmation.
7. **Corrections after lock are manual and refund-only**, from one organizer list (§8). No automatic re-charges.
8. **Waitlist: auto-promote by default, opt-out allowed, auto-promote entries have priority.** This removes the 30-minute claim timer and the dependency on instant notifications.
9. **Wallet stays in MVP.** Paying per game by card costs players more (see the fee comparison under [Wallet limits](#wallet-limits--research-notes)). Balance capped at €150, refundable at full value.
10. **Payouts via Stripe Connect, after the event.** Refunds never need clawing back from organizers.
11. **Organizers belong to the group**, not the event. Co-organizers of a recurring game is a group-level concept.
12. **Price can't go up after the first RSVP**, which keeps holds and saved-card charges valid.
13. **Revenue = service fee, paid by the player on top of the price.** €0.50 per card payment for a game, stepped top-up fee from €1. Organizers get the full price, so a split-evenly €80 court is fully covered.
14. **No service fee on wallet game payments.** Otherwise the wallet costs players more than paying by card and nobody tops up. With it, players pay less per game and we keep more per game, because Stripe's fixed €0.25 is charged once per top-up instead of once per game.
15. **Service fees are non-refundable, except when the organizer cancels a confirmed event.** Stripe keeps its fee on refunds, so the service fee covers that cost. Cancellation is the exception because keeping a fee on a game that didn't happen feels like a penalty, and it should be rare.
16. **Fee schedules are versioned and pinned per event**, so fee changes never affect past or ongoing events.

## Wallet limits — research notes

**Fee economics.** Assumes Stripe Ireland's standard EEA consumer card rate of 1.5% + €0.25, charged on the full amount including our fee. Stripe adds 23% VAT on its fee, which we can reclaim once VAT-registered. Premium, UK and non-EU cards cost more (up to ~3.25% + €0.25), so a few payments will lose money whatever we choose.

| Payment | Player pays | Stripe fee | We keep |
|---|---|---|---|
| €5 game, card (+€0.50) | €5.50 | €0.33 | €0.17 |
| €8 game, card (+€0.50) | €8.50 | €0.38 | €0.12 |
| €10 game, card (+€0.50) | €10.50 | €0.41 | €0.09 |
| €20 game, card (+€0.50) | €20.50 | €0.56 | −€0.06 |
| €20 top-up (+€1) | €21 | €0.57 | €0.44 |
| €50 top-up (+€1.50) | €51.50 | €1.02 | €0.48 |
| €100 top-up (+€2.50) | €102.50 | €1.79 | €0.71 |

- Card payments for games with a flat €0.50 fee **break even at ~€16**. If our own fee carries 23% VAT (to be confirmed, see open questions), break-even drops to ~€10, which matches the planned €0–10 first tier. Most pickup games are under €16, so the flat fee is fine for launch; add tiers when needed.
- A fixed €1 top-up fee would lose money from ~€50 up, hence the stepped top-up fee.
- Cost per €8 game for the player: card €0.50; wallet €0.40 (€20 top-up), €0.24 (€50), €0.20 (€100).

**Why a €150 max balance:**
- Under the EU's 5th AML Directive (AMLD5, Art. 12), member states *may* exempt low-value e-money from full customer ID checks if: max stored ≤ **€150**, remote payments ≤ **€50** each, and cash-out/redemption ≤ **€50**. Our per-game payments are well under €50. Keeping the balance ≤ €150 keeps us inside this if it applies, so users don't have to upload ID to use the wallet.
- Refunds (redemptions) **over €50** would fall outside that exemption. Proposal: refunds over €50 require an ID check (e.g. Stripe Identity), to be confirmed with a lawyer.
- The exemption is optional per member state, and the new EU AML Regulation (2024/1624) replaces the directive from **10 July 2027**, so re-check before then.

**Refunds at full value:** the E-Money Directive (2009/110/EC, Art. 11) requires redemption at par at any time, with a fee only if it's in the terms and proportionate to actual costs. Because the top-up fee is paid on top at top-up time, we refund the full balance with no redemption fee, which sidesteps the question entirely.

**Blocker for building the wallet (not the rest of MVP):** we need to know whether holding a balance that's spendable with independent organizers needs an e-money licence (Central Bank of Ireland) or a licensed partner.
- EBA guidance suggests a platform with its own brand, uniform checkout and uniform sales/return conditions *may* qualify for PSD2's limited-network exclusion. We might fit, but that needs an Irish fintech lawyer to confirm.
- Stripe Connect covers the card → organizer flow; it does not cover us holding balances.

Sources: [AMLD5 thresholds (Bird & Bird)](https://www.twobirds.com/en/insights/2018/germany/the-fifth-european-anti-money-laundering-directive-amld-5), [AMLD5 and prepaid (The Paypers)](https://thepaypers.com/fraud-and-fincrime/expert-views/amld5-and-prepaid-cards-what-has-changed), [E-Money Directive 2009/110/EC (EUR-Lex)](https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32009L0110), [AMLR 2024/1624 (EUR-Lex)](https://eur-lex.europa.eu/eli/reg/2024/1624/oj/eng), [Stripe fees Ireland (FinTask)](https://www.fintask.ie/blog/stripe-fees-ireland), [Stripe EU pricing](https://stripe.com/en-DE/pricing), [PSD2 and marketplaces (Payneteasy)](https://payneteasy.com/blog/psd2-regulations-for-online-marketplaces-and-platforms), [Stripe Connect and PSD2 FAQ](https://stripe.com/guides/frequently-asked-questions-about-stripe-connect-and-psd2), [Central Bank of Ireland PSD2 FAQ](https://www.centralbank.ie/regulation/psd2-overview/faq).

## Open questions

1. **Wallet legal check** (see above): blocks building the wallet, not the rest of MVP.
2. **VAT on our service fee** (accountant): if it's standard-rated at 23%, €0.50 is ~€0.41 net and card payments for games break even at ~€10 instead of ~€16. We may also need to show it as VAT-inclusive.

## Assumptions (easy to revisit)

- Event times are stored with timezone; no multi-timezone UI (single region).
- Min/max includes the organizer if they RSVP like anyone else.
- SMS/WhatsApp and push providers are picked during implementation.
