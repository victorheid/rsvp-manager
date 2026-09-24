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
- Fields: title, description, start date/time, **end time**, location, **cut-off**, min players (default 1), max players (optional; empty means unlimited).
- Cost: a total amount, with an optional itemized breakdown (e.g. "Court booking – €80"). The breakdown is for display only; no logic depends on it.
- Pricing mode:
  - **Fixed per-head**: a set amount regardless of headcount.
  - **Split evenly**: total ÷ headcount at confirmation (cash RSVPs count). Before confirmation the price is shown as a range, from total ÷ max (full event) up to total ÷ min, or "up to total ÷ min" if there's no max.
- **Price lock**: the per-head price is fixed the moment the event is confirmed and never recalculated after that. Later joiners pay the locked price. Headcount changes after that (no-shows, walk-ins) are handled with manual refunds (§8), never with automatic re-charges.
- **Payment options**: **Cash only**, **Online only** (wallet/card), or **Cash + online**. Online options are available only once the organizer has finished Stripe onboarding (§5); until then only Cash only can be picked. Cash RSVPs count toward min/max like any other.
- Toggle **Auto-charge at cut-off** (default on): see §3.
- Shareable link per event: `app.com/e/{event-slug}`, readable and easy to drop in WhatsApp.
- Organizer can create a new event pre-filled from a previous one (recurring games).
- Currency: EUR only.

### Editing an event after people have RSVP'd

- Changes to date/time, location or price notify everyone who's in or on the waitlist.
- The price (fixed amount or split total) **can't go up** once anyone has RSVP'd. It can go down. This avoids re-checking wallet holds and saved cards against a higher amount.
- Lowering max below the current headcount moves the most recent RSVPs to the front of the waitlist.

## 3. Confirmation and cut-off: the one rule

What users need to know: **until the game is confirmed you can drop out for free. Once it's confirmed you're paying; you can still drop out, but whether you get your money back is up to the organizer.**

- **Before confirmation**: join or leave freely; nothing is charged.
- **At cut-off**: if auto-charge is on and min is met, the event is confirmed automatically and prepaid RSVPs (wallet/card) are charged. Cash RSVPs are untouched and owe on the day. If min isn't met or auto-charge is off, the event stays open.
- **Manual confirm**: the organizer can confirm at any time, before or after cut-off. The effect is the same as auto-confirm.
- **After confirmation**: people can still join while spots remain, up to the event start. They're charged immediately at the locked price.
- **Dropping out after confirmation**: players can still drop out in the app, which frees their spot for the waitlist. Nothing is refunded automatically: the payment stays, and the organizer can refund it from their list if they want (§8). A cash RSVP who drops out keeps their cash-due status on the list.

The cut-off is the auto-confirm moment, not an RSVP deadline.

## 4. RSVP flow

- **No account needed to view.** From the event link anyone sees: spots left, price (or range), cut-off, and who's in (first name + last initial).
- Tapping RSVP asks for phone number + SMS code (first time only), then a payment choice: wallet, one-off card, or cash on the day (if allowed).
- RSVPing automatically joins the group.
- If the event is full, the RSVP goes to the waitlist (§6).
- Self-cancel (drop out) is allowed any time up to the event start. Before confirmation it's free; after confirmation the refund is the organizer's call (§3).

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
- **Service fees are non-refundable**, with one exception: when the organizer **cancels a confirmed event**, players also get the service fee back and the platform absorbs Stripe's cost. Stripe keeps its own processing fee on refunds, so refunding our fee would otherwise always cost us money. Every other refund is organizer-initiated, including after a player drops out of a confirmed event.
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
- Joining the waitlist is one tap: no mode or payment method to pick. Payment is chosen when the person takes a spot.
- **Order**: first come, first served, by join time. Everyone can see the numbered waitlist on the event page (§ event page in the UI spec).
- The organizer picks the **waitlist mode** per event, and can change it at any time:
  - **In order** (default): when a spot opens, it's **held** for the first person on the waitlist for the **hold time**: 1 hour by default, set by the organizer per event. While it's held nobody else can take it.
    - They **take the spot**: a normal RSVP with the normal payment choice (wallet, card, or cash if the event allows it). Before confirmation nothing is charged; after confirmation they're charged straight away.
    - They **leave the waitlist**: the spot is held for the next person.
    - The hold **runs out**: they move to the **end of the waitlist** and the spot is held for the next person.
    - If a hold would run past the event's start time, the spot isn't held: it's open to the whole waitlist, first to take it gets it.
  - **First to claim**: when a spot opens, anyone on the waitlist can take it, and the first to do so gets it. No hold, no timer.
- A spot opens when a player drops out, the organizer marks someone as dropped out, or max is raised. Two spots open → two holds, for the first two people.
- Changing the mode doesn't touch holds already running; spots that open afterwards follow the new mode.
- A held spot counts against max but not towards the minimum, so it never makes a game confirm.
- The person the spot is held for sees it at the top of the event page with **Take the spot** / **Leave waitlist** and when the hold runs out. Nothing depends on them getting a notification: the event link always shows it.
- The waitlist closes when the event starts. Holds still running end then.

## 7. Event lifecycle

- **Open**: accepting RSVPs, nothing charged.
- **Confirmed**: auto (cut-off + min met + auto-charge on) or manual. Prepaid RSVPs are charged and the price is locked. People can still join while spots remain (§3).
- **Cancelled**: organizer-triggered at any point before payout. All online payments are refunded in full, **including the service fee**. Holds are released and saved cards are never charged.
- **Expired**: an Open event that is still unconfirmed 48h after its start time. Holds are released and nobody is charged. The 48h gives the organizer time to confirm after the fact (e.g. charging after the game).

## 8. Organizer event list

Attendance, reconciliation and refunds all happen on **one screen per event**. Each person has:

- **Attendance**: everyone counts as **showed** unless the organizer marks them a **no-show**, so the organizer only records the exception. (Stored as `attended`: `null`/`true` = showed, `false` = no-show.) It can only be marked once the game has started.
- **Payment**: held (not charged yet) / paid online / owes (cash due or failed card) / paid outside app / refunded.
- Players who dropped out (or were removed) after confirmation stay on the list marked **Dropped out**, with their payment status clearly visible (e.g. paid online €8.50). No decision is required; the organizer can use the normal refund or mark-paid actions if they want.
- **No-show count** for this group, shown next to their name.

Actions:
- Confirm or cancel the event.
- **Mark as dropped out**, for anyone who's in **or on the waitlist** (e.g. someone who said in WhatsApp they can't come but didn't drop out in the app). Only before the game starts; after that, someone who isn't there is a no-show.
  - Someone who's in: same effect as them dropping out. Before confirmation their wallet hold is released and nothing is charged; after confirmation the payment stays and they show as dropped out, refundable like anyone else. The spot goes to the waitlist (§6).
  - Someone on the waitlist (including one with a spot held for them): they leave the waitlist. Nothing to refund; a held spot passes to the next person.
  - Either way they're listed under **Dropped out** on the event page, and the player is notified.
- Mark attendance (after the event).
- Mark a payment as **paid outside app** (cash collected, bank transfer, etc.). This is record-keeping only; no money moves.
- **Add a walk-in**: a name-only record (no account) with a payment status. Walk-ins don't count against max.
- **Refund one person**, or **refund all online-paid** in bulk. The price is refunded in full, back to the original method (wallet or card), and refunds are available until payout (§5). The service fee is not refunded; only cancelling the event refunds it.

### Reliability
- No-show count is **per group** and visible only to that group's organizers, never to the player or to other groups.
- It's informational only; nothing (waitlist order, refunds) is automated from it.

## 9. Notifications

- **Web push** is the primary channel. **SMS/WhatsApp** is the fallback, used only for money-related messages (charged, payment failed, cancelled/refunded, spot held for you) to keep costs down.
  - On iPhone, web push only works if the user has added the app to their Home Screen, so many iPhone users will only receive the fallback messages.
- Nothing depends on a notification arriving: the event page always shows the current list and any action waiting for the viewer (a held spot, money owed). Notifications are a nudge to open the link.

Triggers:
| Trigger | Who |
|---|---|
| New event posted | Group members |
| Cut-off reminder (e.g. 24h before) | Everyone in, and waitlist |
| Spot held for you (in-order waitlist) | That person |
| Cut-off passed without min met, or auto-charge off (confirm or cancel) | Organizer |
| Marked as dropped out by organizer | That person |
| Spot open (first-to-claim waitlist) | Everyone on the waitlist |
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
8. **Waitlist mode is set per event: "in order" (spot held for the next person, 1h by default) or "first to claim".** Replaced the earlier per-person auto-join / notify-me choice, which needed a payment method at waitlist time and pushed a lot onto notifications. The event link is where people check their place, and groups already coordinate in WhatsApp, so a short hold that anyone can see on the page works without reliable notifications. An expired hold sends the person to the end of the list, so an unanswered hold costs them their place and not the group's spot. (2026-09-24)
9. **Wallet stays in MVP.** Paying per game by card costs players more (see the fee comparison under [Wallet limits](#wallet-limits--research-notes)). Balance capped at €150, refundable at full value.
10. **Payouts via Stripe Connect, after the event.** Refunds never need clawing back from organizers.
11. **Organizers belong to the group**, not the event. Co-organizers of a recurring game is a group-level concept.
12. **Price can't go up after the first RSVP**, which keeps holds and saved-card charges valid.
13. **Revenue = service fee, paid by the player on top of the price.** €0.50 per card payment for a game, stepped top-up fee from €1. Organizers get the full price, so a split-evenly €80 court is fully covered.
14. **No service fee on wallet game payments.** Otherwise the wallet costs players more than paying by card and nobody tops up. With it, players pay less per game and we keep more per game, because Stripe's fixed €0.25 is charged once per top-up instead of once per game.
15. **Service fees are non-refundable, except when the organizer cancels a confirmed event.** Stripe keeps its fee on refunds, so the service fee covers that cost. Cancellation is the exception because keeping a fee on a game that didn't happen feels like a penalty, and it should be rare.
16. **Fee schedules are versioned and pinned per event**, so fee changes never affect past or ongoing events.
17. **Dropping out is always possible; refunds after confirmation are the organizer's call.** The spot goes back to the waitlist straight away. There's no refund-decision step: the entry just shows as dropped out with what they paid, and the organizer refunds if they want to.
18. **Payment options per event: cash only / online only / both.** Online needs finished Stripe onboarding, so a new organizer can run cash games from day one.
19. **When a game doesn't reach its minimum by cut-off, the organizer is alerted** to confirm anyway or cancel. If they do neither, it expires 48h after start (§7).
20. **The event page leads with the list.** Most visits are someone checking "am I in, where am I in the queue", so In / Waitlist / Dropped out sit right under the title, with the viewer's own row highlighted. Everything about the viewer (their status, a held spot and until when, money owed, and the action for it) sits in the bottom action bar, so the page body stays about the game. The organizer can mark anyone dropped out, including waitlisters, so the list matches what was said in the chat. (2026-09-24)

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
