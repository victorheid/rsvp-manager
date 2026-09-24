# Market research: what else solves this today

Researched 2026-09-24. Prices and features come from public help pages, app-store listings and review sites. They change often; items marked *(unverified)* came from third-party sources only.

## 1. The business in one paragraph

A mobile-web app for **recurring pickup games** (e.g. "Thursday Basketball Galway") that replaces the organizer's WhatsApp poll + Revolut chasing. Players open a link from the group chat, RSVP with a phone number and one tap, and pay by wallet, card or cash. The organizer never fronts or chases money: the court cost is **split evenly and locked at confirmation**, nobody is charged until the game is confirmed (min players reached at cut-off, or confirmed manually), a waitlist fills drop-outs, and payouts go to the organizer via Stripe Connect two days after the game. Revenue is a **service fee paid by the player on top** (€0.50 per card payment, stepped fee on wallet top-ups); the organizer always receives the full price. Launch market: Ireland, EUR only.

### The job to be done

| Who | Pain today | What they want |
|---|---|---|
| Organizer (usually a volunteer player) | Books and pays the court upfront, runs a WhatsApp poll, chases 10 people for €8 each, eats the loss when people drop out or the game falls through. | Money collected before they're out of pocket, no chasing, no admin, no losing money on a cancelled game. |
| Player | Unclear if the game is on, who's in, what it costs, how to pay. | See the list, tap in, pay once it's on, drop out easily. |

The real competitor is **"WhatsApp poll + Revolut/bank transfer + the organizer's goodwill"**. It's free, everyone already has it, and it's good enough until the group grows or money goes missing.

## 2. Landscape

Four kinds of product overlap with this one. None combines all of: link-first (no app install), pay-only-when-confirmed, split-evenly pricing with a price lock, cash alongside card, and organizer receiving the full price.

### A. Direct: casual-game organizer apps

| Product | Market | Model | How payment works | Waitlist | Notes |
|---|---|---|---|---|---|
| **Capo** (caposport.com) | UK, 5-a-side football | Free for organizers; player pays fees on top, ~15–20% of the price (e.g. £5.00 → £5.90) | Pay at RSVP, required before the spot is confirmed. In-app payments UK-only; elsewhere RSVP-only (cash/bank transfer). Weekly payouts. | Offer to next person with a claim window, then moves down. Dropout refunded (minus fee) only if a replacement pays; otherwise forfeits. | **Closest competitor in model and philosophy** ("replace the admin side of WhatsApp"). Football-only, native app, pay-upfront, no split pricing. Also does AI team picking and stats. Not live for payments in Ireland. |
| **Five** (Flatmap, Belgium) | BE/EU, 5–7-a-side | Free *(unverified)* | No in-app money: payment links to Payconiq, Revolut or any URL, plus automatic reminders. | Registration opens at a set time. | Strong on team balancing ("pick & ban"). Shows the "link out to Revolut" approach is common in Europe. |
| **Spond** | Global (Norway-born), huge in Nordics/UK/IE | App free; revenue from payment fees (UK: 2.5% + £0.20). Club pays by default, or passes it to members. | Registration fee at sign-up, or "request payment" after the event from those who attended. Stripe. | First on waitlist is notified, can accept or decline; not charged until they have a spot. | **Biggest threat by distribution**: free, already on many Irish players' phones via clubs. Built for clubs and teams (members, seasons, kids), not for splitting a court between adults. No split-evenly/price lock; native app needed. |
| **Heja**, **SportEasy**, **SportMember**, **TeamSnap** | Team management (youth, amateur clubs) | Freemium + subscription (SportEasy €9.99/mo premium; SportMember from ~£22/mo + £0.35 + 1% per payment; TeamSnap ~$10–14/mo per team, fees not published) | Team fees/dues, invoices. | Mostly availability, not capacity + waitlist. | Solve scheduling and dues for a fixed roster. Weak fit for open, drop-in games with a max headcount. |

### B. Marketplaces: find a game near you

| Product | Market | Model | Notes |
|---|---|---|---|
| **Footy Addicts** | UK football | Pay-per-game (£3.50–£5 typical); card fee 4.3% + 20p by default plus VAT | Discovery marketplace; organizers list public games. Players are strangers, not a group. |
| **Plei** | US soccer | Pay-per-game; ~$4.5M revenue 2023, 180k players, 40k games | **"No charge if the game doesn't confirm with enough players"**, the same pivot as our §3, validated at scale in the US. |
| **OpenSports** | US/CA, multi-sport | Organizer SaaS $20–$500/mo | Pickup, leagues, memberships, automatic waitlist with a time window. Aimed at businesses running games, too heavy and pricey for one volunteer. |
| **Playtomic** | EU/global, padel & tennis | Player service fee on every online payment except wallet (varies by country); Premium subscription removes it | Court booking + open matches with automatic cost split. **Their model mirrors ours** (service fee on top, wallet exempt, fee refunded if the match is cancelled), which shows players accept it. Tied to partner clubs' courts; racket sports only. |
| **Meetup** | Global, any activity | Organizer subscription from $29.99/mo; 5% + $0.30 on paid RSVPs | General-purpose; organizer pays the subscription, which casual sports organizers resist. |

### C. Club administration (Ireland)

**Clubforce** (Galway, 2000+ Irish clubs) and **ClubZap** handle memberships, lotto, fundraising and tickets for GAA/FAI/rugby clubs. Club-level subscription plus negotiated transaction fees. They own the formal-club relationship but don't do casual games with a headcount, split cost and waitlist.

### D. The default: chat + payment apps

- **WhatsApp polls / group chat** for "who's in". Free and universal. No cap, no waitlist, no record of who paid.
- **Revolut** Split Bill / Group Bills (free, invite even non-Revolut users, automatic reminders), bank transfer, cash on the day. The organizer still fronts the court cost and chases people.
- **Splitwise-style apps** track who owes what but move no money.

## 3. How we compare on what matters

| | Us | Capo | Spond | Plei | Playtomic | WhatsApp + Revolut |
|---|---|---|---|---|---|---|
| Join from a link, no app install | ✅ PWA, phone + SMS | ❌ app | ❌ app | ❌ app | ❌ app | ✅ |
| Not charged until the game is on | ✅ confirmation pivot | ❌ pay at RSVP | ⚠️ organizer's choice | ✅ | ⚠️ partly | n/a |
| Split-evenly with a range and a price lock | ✅ | ❌ fixed price | ❌ | ⚠️ organizer split | ✅ court split (fixed 4 players) | manual |
| Cash and online in the same game | ✅ | ⚠️ one or the other | ⚠️ | ❌ | ❌ | ✅ |
| Waitlist with a held spot | ✅ in order or first to claim | ✅ | ✅ | ✅ | n/a | ❌ |
| Organizer gets the full price | ✅ fee on top | ✅ fee on top | ⚠️ configurable | ? | ✅ | ✅ |
| Player fee per game (≈€8 game) | €0.50 card, ~€0.20–0.40 via wallet | ~€1.20–1.60 | ~€0.40 | ? | varies; €0 on Premium | €0 |
| Available in Ireland with payments | ✅ (target) | ❌ | ✅ | ❌ | ✅ | ✅ |

## 4. What this means

**Where we're differentiated**
1. **Price for players.** €0.50 flat (less via wallet) is well below Capo's 15–20% and Footy Addicts' 4.3% + 20p + VAT on a typical €5–10 game. It's the easiest message to sell.
2. **The confirmation pivot + split pricing.** Nobody else in casual sport offers "pay nothing until it's on, then a locked, fair share of the court". This is what takes the risk off the organizer.
3. **Link-first, no install.** Every direct competitor is a native app. Our flow fits how groups already work in WhatsApp.
4. **Cash and online in one list**, so a group can move over gradually instead of forcing everyone onto cards on day one.
5. **Ireland first.** Capo's payments are UK-only and Plei is US-only; the Irish casual-game niche is served mainly by Spond (club-oriented) and WhatsApp.

**Risks**
1. **"Free" is the bar.** WhatsApp + Revolut costs nothing. The pitch must be the organizer's pain (fronting money, chasing, losing on dropouts), not features. Organizers pick the tool; players tolerate a small fee if the organizer asks.
2. **Spond is already installed** across Irish clubs, is free, and added waitlists and event payments. If it adds split pricing or a web RSVP it closes most of the gap. Position against it as "for the game you organize with mates, not your club".
3. **Capo could expand to Ireland.** Same philosophy, more features (team picking, stats). Our edge there is price, cash support, no install and multi-sport.
4. **Wallet legal question** (spec open question 1). Playtomic runs a wallet in the EU, so it's doable, but it's the most regulated part of the plan. The rest of the product stands without it.
5. **Low willingness to pay per player.** The €0.50 fee sits close to break-even on card payments (spec, *Wallet limits*); volume and wallet adoption carry the margin.

**Ideas worth borrowing (post-MVP, not commitments)**
- Team balancing/picking (Capo, Five): a strong reason for organizers to open the app every week.
- Automatic refund to a dropout once their spot is taken and paid (Capo): a fair default that could replace some manual refunds.
- A Premium tier that removes fees for frequent players (Playtomic): an alternative to the wallet if the licence question blocks it.
- Discovery of open games (Footy Addicts, Plei): only once "Open to non-members" games exist at volume.

## Sources

- Capo: [How payments and RSVPs work](https://caposport.com/how-it-works/payments-and-rsvps), [Match payments help](https://caposport.com/help/match-payments), [Best 5-a-side apps 2026](https://caposport.com/guides/best-5-a-side-apps-2026), [Collecting money for five-a-side](https://caposport.com/blog/collecting-money-five-a-side)
- Five: [Google Play listing](https://play.google.com/store/apps/details?id=be.flatmap.five)
- Spond: [Payments in Spond](https://help.spond.com/app/en/articles/118080-payments-in-spond), [Payment costs](https://help.spond.com/app/en/articles/118091-payments-costs-in-the-spond-app), [Payment for events](https://help.spond.com/app/en/articles/129968-payment-for-events), [Features in events](https://help.spond.com/app/en/articles/129730-features-in-events), [ClubPal: Spond fees](https://www.clubpal.app/compare/spond-alternative)
- Heja: [Pricing](https://heja.io/pricing); SportEasy / SportMember: [GetApp SportEasy](https://www.getapp.com/recreation-wellness-software/a/sporteasy/), [GetApp SportMember](https://www.getapp.com/recreation-wellness-software/a/sportmember/), [Klubraum comparison](https://klubraum.com/blog/the-17-best-apps-for-your-team-comparison/); TeamSnap: [Capterra pricing](https://www.capterra.com/p/123208/TeamSnap/pricing/)
- Footy Addicts: [What do I pay for?](https://footyaddicts.uservoice.com/knowledgebase/articles/1998847-what-do-i-pay-for), [Charged more than the game cost](https://footyaddicts.uservoice.com/knowledgebase/articles/1952971-charged-more-than-cost-of-the-game-why)
- Plei: [plei.com](https://www.plei.com/), [Benzinga profile](https://www.benzinga.com/money/plei)
- OpenSports: [Pricing](https://opensports.net/pricing), [Waitlists](https://opensports.net/blog/waitlists-for-sports-and-fitness-groups-with-popular-events)
- Playtomic: [Service fee](https://playerhelp.playtomic.com/hc/en-gb/articles/19831779272337-Service-Fee), [Open matches](https://playerhelp.playtomic.com/hc/en-gb/articles/19832151055121-How-to-sign-up-for-an-Open-Match-Padel-Tennis)
- Meetup: [Organizer subscription prices](https://help.meetup.com/hc/en-us/articles/28677808413197-Organizer-Subscription-prices-overview), [Event service fees](https://help.meetup.com/hc/en-us/articles/39489419634189-Why-does-Meetup-charge-a-service-fee-for-ticketed-events)
- Clubforce: [clubforce.com](https://clubforce.com/); ClubZap: [Pricing](https://clubzap.com/pricing/), [Fees](https://help.clubzap.com/en/articles/4605317-how-can-i-see-what-fees-are-applied-for-payments)
- Revolut: [Group Bills](https://www.revolut.com/blog/post/save-friendships-with-group-bills/), [Split a bill](https://help.revolut.com/help/adding-money/with-money-from-friends-or-relatives/splitting-bill/)
