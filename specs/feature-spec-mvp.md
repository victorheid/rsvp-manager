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
- **Card RSVP**: the card is saved at RSVP time (Stripe SetupIntent) and charged at confirmation. A pre-authorization hold isn't used because those expire before a typical cut-off.
- **Failed card charge** (expired card, bank asks for 3D Secure): the person is marked **owes**, gets a pay link, and shows up as owing in the organizer's list (§8), exactly like unpaid cash.

### Wallet
- One global balance per user, usable across any group or event.
- Top up in fixed amounts via card (proposed €20 / €50 / €100). **Max balance: €150**, and a top-up that would exceed it is blocked. See [Wallet limits](#wallet-limits--research-notes) for why.
- Wallet RSVP = no fee. One-off card RSVP = fee shown, with a prompt showing the saving from topping up instead.
- Refundable on request, minus the processing fee paid on top-ups (blended average fee rate across the user's top-ups).

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
- **Cancelled**: organizer-triggered at any point before payout. All online payments are refunded in full with no fee to the RSVPer; holds are released and saved cards are never charged.
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
- **Refund one person**, or **refund all online-paid** in bulk. Refunds are full, with no fee to the player, back to the original method (wallet or card), and available until payout (§5).

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
9. **Wallet stays in MVP.** The per-transaction card fee (~€0.37 on an €8 game, ~4.6%) matters to regular players. Balance capped at €150.
10. **Payouts via Stripe Connect, after the event.** Refunds never need clawing back from organizers.
11. **Organizers belong to the group**, not the event. Co-organizers of a recurring game is a group-level concept.
12. **Price can't go up after the first RSVP**, which keeps holds and saved-card charges valid.

## Wallet limits — research notes

**Fees** (Stripe Ireland, standard EEA consumer cards: 1.5% + €0.25, plus 23% VAT on the fee, reclaimable if VAT-registered):

| Payment | Stripe fee | Effective rate |
|---|---|---|
| €8 game, paid by card | €0.37 | 4.6% |
| €20 top-up | €0.55 | 2.75% |
| €50 top-up | €1.00 | 2.0% |
| €100 top-up | €1.75 | 1.75% |

Even a €20 top-up cuts the fee rate per game by ~40% compared with paying by card each time. Beyond €50 the saving flattens, so there's little reason to push larger top-ups.

**Why a €150 max balance:**
- Under the EU's 5th AML Directive (AMLD5, Art. 12), member states *may* exempt low-value e-money from full customer ID checks if: max stored ≤ **€150**, remote payments ≤ **€50** each, and cash-out/redemption ≤ **€50**. Our per-game payments are well under €50. Keeping the balance ≤ €150 keeps us inside this if it applies, so users don't have to upload ID to use the wallet.
- Refunds (redemptions) **over €50** would fall outside that exemption. Proposal: refunds over €50 require an ID check (e.g. Stripe Identity), to be confirmed with a lawyer.
- The exemption is optional per member state, and the new EU AML Regulation (2024/1624) replaces the directive from **10 July 2027**, so re-check before then.

**Refund fee is allowed:** the E-Money Directive (2009/110/EC, Art. 11) requires redemption at par at any time. A fee is allowed only if it's in the terms and is proportionate to actual costs. Deducting the actual top-up processing fee fits that.

**Blocker for building the wallet (not the rest of MVP):** we need to know whether holding a balance that's spendable with independent organizers needs an e-money licence (Central Bank of Ireland) or a licensed partner.
- EBA guidance suggests a platform with its own brand, uniform checkout and uniform sales/return conditions *may* qualify for PSD2's limited-network exclusion. We might fit, but that needs an Irish fintech lawyer to confirm.
- Stripe Connect covers the card → organizer flow; it does not cover us holding balances.

Sources: [AMLD5 thresholds (Bird & Bird)](https://www.twobirds.com/en/insights/2018/germany/the-fifth-european-anti-money-laundering-directive-amld-5), [AMLD5 and prepaid (The Paypers)](https://thepaypers.com/fraud-and-fincrime/expert-views/amld5-and-prepaid-cards-what-has-changed), [E-Money Directive 2009/110/EC (EUR-Lex)](https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32009L0110), [AMLR 2024/1624 (EUR-Lex)](https://eur-lex.europa.eu/eli/reg/2024/1624/oj/eng), [Stripe fees Ireland (FinTask)](https://www.fintask.ie/blog/stripe-fees-ireland), [Stripe EU pricing](https://stripe.com/en-DE/pricing), [PSD2 and marketplaces (Payneteasy)](https://payneteasy.com/blog/psd2-regulations-for-online-marketplaces-and-platforms), [Stripe Connect and PSD2 FAQ](https://stripe.com/guides/frequently-asked-questions-about-stripe-connect-and-psd2), [Central Bank of Ireland PSD2 FAQ](https://www.centralbank.ie/regulation/psd2-overview/faq).

## Open questions

1. **Platform business model**: does the platform take a cut of each payment, and if so, how is it shown?
2. **Who absorbs Stripe's fee on refunds**: Stripe doesn't return its processing fee when a payment is refunded. For organizer-issued refunds and cancellations (full refund to the player), this cost lands on either the organizer (deducted from payout) or the platform.
3. **Wallet legal check** (see above): blocks building the wallet, not the rest of MVP.

## Assumptions (easy to revisit)

- Event times are stored with timezone; no multi-timezone UI (single region).
- Min/max includes the organizer if they RSVP like anyone else.
- SMS/WhatsApp and push providers are picked during implementation.
