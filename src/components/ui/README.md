# UI kit

The reusable building blocks of every screen: buttons, form fields, banners, sheets, list rows. Import from the barrel and nothing else:

```tsx
import { Button, Banner, BottomSheet, useToast } from "@/components/ui";
```

- **Live gallery:** run `pnpm dev` and open [`/design`](../../app/design/page.tsx) — every component in every state, Light and Dark. It 404s in production.
- **Design source:** the Figma file (pages *Foundations*, *Components*, *Screens*, and *Flows & Audit*, which explains why each screen looks the way it does). The kit is its code twin, and the names match: Figma `StatusChip` → `<StatusChip>`, Figma variable `color/bg/canvas` → `--color-bg-canvas` → `bg-bg-canvas`. **Change Figma first, then the code**, so the two never drift.
- **Product rules behind the screens:** [`specs/ui-ux-spec-mvp.md`](../../../specs/ui-ux-spec-mvp.md).

## Direction

Friendly and social: warm sand surfaces, one coral accent, Nunito, generously rounded shapes, Light and Dark. Designed at 390px, for one hand at the pitch: the primary action sits in the bottom third, tap targets are at least 44px, and status never relies on colour alone.

## Rules of the road

1. **Semantic tokens only.** Use `bg-bg-surface`, `text-text-secondary`, `border-border-default`, `bg-accent-default`… never a raw ramp (`bg-coral-600`) and never a hex value. Semantic tokens flip with the theme, so **components have no `dark:` variants**.
2. **One primary action per screen.** Everything else is `secondary` or `ghost`. `destructive` belongs only on the button that commits an irreversible action *inside a confirmation sheet* — never on the button that opens it.
3. **Say the rule in plain words.** State the consequence before the tap that commits it (`Banner`, `ConfirmSheet`). Use the vocabulary in UI spec §11 — "Game on", "Didn't go ahead" — never enum names.
4. **Status is text first.** A `StatusChip` or `Banner` always carries a label (and an icon); colour only reinforces it.
5. **Reversible → toast with Undo; irreversible → confirmation sheet.** That is what makes a ••• menu safe to tap.
6. **Rows inform, menus act.** In a list of people, the row shows status and the ••• menu holds every action (see `PersonManageRow`).
7. **Use the text styles** (`text-title`, `text-small-strong`…), not `text-sm font-semibold`.
8. **Everything reachable by tap and keyboard.** No hover-only behaviour. Every icon-only control has an `aria-label`.

## Tokens

Defined in [`src/app/globals.css`](../../app/globals.css).

### Colour (semantic)

| Group | Tokens | Use |
|---|---|---|
| Surfaces | `bg-canvas` (page), `bg-surface` (cards, sheets, inputs), `bg-subtle` (wells, disabled, chips), `bg-overlay` (toasts, scrim) | `bg-bg-canvas` |
| Text | `text-primary`, `text-secondary`, `text-tertiary` (placeholders, meta), `text-on-accent` (on coral/danger fills), `text-on-overlay`, `text-link` | `text-text-secondary` |
| Border | `border-default` (cards), `border-strong` (inputs), `border-focus` | `border-border-strong` |
| Accent | `accent-default` (primary fill), `accent-pressed`, `accent-subtle` (tinted fill), `accent-subtle-text` | `bg-accent-default` |
| Status | `success`, `warning`, `danger`, `info`, each with `-bg`, `-border`, `-fg` (text/icons on `-bg`) and `-solid` (a strong fill) | `bg-success-bg text-success-fg` |

### Type

`text-display` 32/ExtraBold · `text-title` 24/Bold · `text-heading` 18/Bold · `text-body` 16 · `text-body-strong` 16/SemiBold · `text-small` 14 · `text-small-strong` 14/SemiBold · `text-caption` 12/SemiBold · `text-button` 16/Bold · `text-number` 28/ExtraBold (headcounts).

### Space, radius, elevation

| Figma | Tailwind | px |
|---|---|---|
| `space/2xs` … `space/3xl` | `0.5, 1, 2, 3, 4, 6, 8, 12` | 2, 4, 8, 12, 16, 24, 32, 48 |
| `radius/sm` `md` `lg` `xl` `full` | `rounded-sm` `-md` `-lg` `-xl` `-full` | 8, 12, 16, 24, pill |
| `Shadow/sm` `md` `lg` `sheet` | `shadow-sm` `-md` `-lg` `-sheet` | — |

Cards are `rounded-lg`, inputs `rounded-md`, buttons and chips `rounded-full`, sheets `rounded-t-xl`.

## Components

### Foundations
| Component | Use it for |
|---|---|
| `Icon` / `IconButton` | The 19-icon set (24px, `currentColor`). `IconButton` is the 44px icon-only button/link; needs a `label`. |
| `Button` | Every action. `variant` primary / secondary / ghost / destructive, `size` md (44px) / lg (52px), `fullWidth`, `loading`, `leadingIcon`, or `href` to render a link. |
| `StatusChip` | A short status with a dot: `tone` neutral / accent / success / warning / danger / info. |
| `Banner` | An inline explanation or consequence, with a title, body and optional action. |

### Forms
| Component | Use it for |
|---|---|
| `TextField`, `TextArea` | Labelled inputs with helper/error text. Pass `type="date" \| "time" \| "tel" …` straight through. |
| `SegmentedControl` | Pick one of 2–3 short options ("Fixed per person" / "Split the cost"). |
| `Stepper` | A small whole number with − / + (min players). |
| `OptionCard` | A big radio choice with explanation (payment method). |
| `ToggleRow` | An on/off switch with a label and description. |

### Showing a game and its people
| Component | Use it for |
|---|---|
| `EventCard` | A game in a list; the whole card links to it. |
| `HeadcountBar` | "Is it on?": count, minimum marker, spots left. |
| `KeyFact`, `PriceBlock`, `SectionHeader` | Event-page building blocks. |
| `PersonRow` | A person in a public list. |
| `PersonManageRow` | A person in the organizer's list: informational row, actions in its ••• menu. |
| `Avatar`, `FilterChip`, `EmptyState`, `Skeleton`, `SectionSkeleton` | Initials, filter pills with counts, "nothing here yet", loading placeholders (one block / a section's rows). |

### Navigation and layout
| Component | Use it for |
|---|---|
| `Screen` | The page shell: `TopBar` + content + optional `StickyActionBar`. Every page uses it. |
| `TopBar` | `brand` for top-level screens, `backHref` + `title` below them. `actions` takes icon buttons or a menu. |
| `StickyActionBar` | The one primary action, plus one line of context. |
| `TabBar` | Bottom nav (Games / Wallet / Me). **Built but not mounted** until Wallet and `/me` exist. |
| `ActionMenu` | A ••• menu. Verbs, optional second line for anything with side effects, most likely action first (`tone: "primary"`), destructive last (`tone: "danger"`). |

### Overlays and feedback
| Component | Use it for |
|---|---|
| `BottomSheet` | Any multi-step flow started from a page. Bottom sheet on a phone, centred dialog from `sm` up. Native `<dialog>`: focus trap, Esc, inert page behind. |
| `ConfirmSheet` | Consequence-before-commit: banner + commit button + way out. Pass `tone="destructive"` for irreversible actions. |
| `ShareSheet`, `SharePreview`, `LinkField` | Share a link: preview, copy, WhatsApp, native share. |
| `ToastProvider` / `useToast` | Brief feedback with optional Undo. Provider is mounted in the root layout. |

## Recipes

**A screen**
```tsx
<Screen
  topBar={<TopBar backHref="/g/westside" title="Game" actions={<IconButton icon="share" label="Share" onClick={openShare} />} />}
  actionBar={<StickyActionBar context="Nothing charged now"><Button size="lg" fullWidth>I’m in</Button></StickyActionBar>}
>
  …sections…
</Screen>
```

**A reversible action** — do it, then offer Undo:
```tsx
const toast = useToast();
markPaid.mutate({ rsvpId }, {
  onSuccess: () => toast({ message: "Priya K. marked as paid", actionLabel: "Undo", onAction: () => undo.mutate({ rsvpId }) }),
});
```

**An irreversible action** — say what happens first:
```tsx
<ConfirmSheet open={open} onClose={close} title="Cancel this game?" tone="destructive"
  banner={{ tone: "danger", title: "8 people are in", body: "The game will show as cancelled. This can’t be undone." }}
  confirmLabel="Cancel game" cancelLabel="Keep game" pending={cancel.isPending} onConfirm={() => cancel.mutate({ eventId })} />
```

**A form in a sheet** — sheet children only mount while open, so keep the form's state in a child component and it resets each time (see `SignInSheet`, `AddWalkInSheet`).

## Adding or changing a component

1. **Design it in Figma first** (or change it there), using variables — no raw values.
2. One file per component in this folder, named after it, with a doc comment that says *what it's for, when not to use it, and any behaviour that isn't obvious*.
3. Props come from real use, not hypothetical variety. Derive types (`ComponentPropsWithoutRef`, `ReturnType`…); never retype something that already exists.
4. Export it from `index.ts`, add it to the `/design` gallery in every state, and add it to the table above.
5. If it holds logic worth testing (parsing, ordering, formatting), pull that out into a pure function and unit-test it. Components themselves are covered by the gallery and by using them.
6. No `any`, no `as`, no `!`, no `eslint-disable` — same as everywhere (see [CLAUDE.md](../../../CLAUDE.md)).

Feature-specific pieces (a sign-in sheet, the RSVP sheet, the manage screen's presentation) live next to the page that uses them, in `_components/`. Something moves into the kit only when a *second* place needs it.

## Known gaps

- `TabBar` isn't mounted (no Wallet or `/me` yet).
- Sheets animate in (slide up / fade in) but not out: a native `<dialog>` closes instantly.
