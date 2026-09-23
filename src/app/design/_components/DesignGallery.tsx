"use client";

import { useState, type ReactNode } from "react";
import {
  ActionMenu,
  Avatar,
  Banner,
  BottomSheet,
  Button,
  ConfirmSheet,
  EmptyState,
  EventCard,
  FilterChip,
  HeadcountBar,
  ICON_BUTTON_CLASS,
  ICON_NAMES,
  Icon,
  IconButton,
  KeyFact,
  LinkField,
  OptionCard,
  PersonManageRow,
  PersonRow,
  PriceBlock,
  SectionHeader,
  SegmentedControl,
  SharePreview,
  ShareSheet,
  Skeleton,
  StatusChip,
  Stepper,
  StickyActionBar,
  TabBar,
  TextArea,
  TextField,
  ToggleRow,
  TopBar,
  useToast,
  type ChipTone,
} from "@/components/ui";

type Theme = "system" | "light" | "dark";

const SEMANTIC_COLORS = [
  "bg-canvas",
  "bg-surface",
  "bg-subtle",
  "bg-overlay",
  "text-primary",
  "text-secondary",
  "text-tertiary",
  "text-on-accent",
  "text-link",
  "border-default",
  "border-strong",
  "border-focus",
  "accent-default",
  "accent-pressed",
  "accent-subtle",
  "accent-subtle-text",
  "success-bg",
  "success-border",
  "success-fg",
  "success-solid",
  "warning-bg",
  "warning-border",
  "warning-fg",
  "warning-solid",
  "danger-bg",
  "danger-border",
  "danger-fg",
  "danger-solid",
  "info-bg",
  "info-border",
  "info-fg",
  "info-solid",
];

const TYPE_STYLES = [
  ["text-display", "Thursday 5-a-side"],
  ["text-title", "Who’s in"],
  ["text-heading", "Confirms Wed 19:00"],
  ["text-body", "Game on. Confirmed Wed 19:00."],
  ["text-body-strong", "€8.00 each"],
  ["text-small", "Aoife M. · Organizer"],
  ["text-small-strong", "Drop out free until Wed"],
  ["text-caption", "GOING · WAITLIST"],
  ["text-button", "I’m in — nothing charged now"],
  ["text-number", "8 in"],
] as const;

const CHIP_TONES: ChipTone[] = ["neutral", "accent", "success", "warning", "danger", "info"];

function Section({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <div>
        <h2 className="text-title text-text-primary">{title}</h2>
        {note && <p className="text-small text-text-secondary">{note}</p>}
      </div>
      {children}
    </section>
  );
}

function Specimen({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-caption uppercase text-text-tertiary">{label}</p>
      {children}
    </div>
  );
}

export function DesignGallery() {
  const [theme, setTheme] = useState<Theme>("system");
  const toast = useToast();

  const [segment, setSegment] = useState<"FIXED_PER_HEAD" | "SPLIT_EVENLY">("SPLIT_EVENLY");
  const [players, setPlayers] = useState(6);
  const [payment, setPayment] = useState("wallet");
  const [toggle, setToggle] = useState(true);
  const [filter, setFilter] = useState("all");
  const [sheet, setSheet] = useState<"none" | "sheet" | "confirm" | "share">("none");

  return (
    <div data-theme={theme === "system" ? undefined : theme} className="min-h-dvh bg-bg-canvas text-text-primary">
      <div className="mx-auto flex max-w-3xl flex-col gap-12 px-4 py-10">
        <header className="flex flex-col gap-4">
          <h1 className="text-display">Design system</h1>
          <p className="text-body text-text-secondary">
            Every component in the kit, in every state. Source of truth is the Figma file; the rules for using them
            are in <code>src/components/ui/README.md</code>.
          </p>
          <SegmentedControl
            label="Theme"
            value={theme}
            onChange={setTheme}
            options={[
              { value: "system", label: "System" },
              { value: "light", label: "Light" },
              { value: "dark", label: "Dark" },
            ]}
          />
        </header>

        <Section title="Colour" note="Semantic tokens only — they flip with the theme. Components never use raw ramps.">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {SEMANTIC_COLORS.map((name) => (
              <div key={name} className="flex flex-col gap-1">
                <div
                  className="h-12 rounded-md border border-border-default"
                  style={{ background: `var(--color-${name})` }}
                />
                <code className="text-caption font-normal text-text-secondary">{name}</code>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Typography" note="Nunito. Use the text-* classes; never set size or weight by hand.">
          <div className="flex flex-col gap-3">
            {TYPE_STYLES.map(([cls, sample]) => (
              <div key={cls} className="flex items-baseline gap-4">
                <code className="w-32 shrink-0 text-caption font-normal text-text-tertiary">{cls}</code>
                <span className={cls}>{sample}</span>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Radius & elevation">
          <div className="flex flex-wrap gap-4">
            {(["rounded-sm", "rounded-md", "rounded-lg", "rounded-xl", "rounded-full"] as const).map((cls) => (
              <div key={cls} className="flex flex-col items-center gap-1">
                <div className={`h-16 w-24 border border-border-default bg-bg-surface ${cls}`} />
                <code className="text-caption font-normal text-text-secondary">{cls}</code>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-6 py-2">
            {(["shadow-sm", "shadow-md", "shadow-lg", "shadow-sheet"] as const).map((cls) => (
              <div key={cls} className="flex flex-col items-center gap-2">
                <div className={`h-16 w-24 rounded-lg bg-bg-surface ${cls}`} />
                <code className="text-caption font-normal text-text-secondary">{cls}</code>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Icons" note="24px grid, 2px stroke, currentColor.">
          <div className="flex flex-wrap gap-4">
            {ICON_NAMES.map((name) => (
              <div key={name} className="flex w-20 flex-col items-center gap-1 text-text-primary">
                <Icon name={name} />
                <code className="text-caption font-normal text-text-tertiary">{name}</code>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Button" note="One primary per screen. Destructive only on the commit button inside a confirmation.">
          <Specimen label="Variants · md">
            <div className="flex flex-wrap items-center gap-3">
              <Button>Primary</Button>
              <Button variant="secondary">Secondary</Button>
              <Button variant="ghost">Ghost</Button>
              <Button variant="destructive">Destructive</Button>
            </div>
          </Specimen>
          <Specimen label="Large, full width">
            <Button size="lg" fullWidth>
              I’m in
            </Button>
          </Specimen>
          <Specimen label="States">
            <div className="flex flex-wrap items-center gap-3">
              <Button disabled>Disabled</Button>
              <Button loading>Saving</Button>
              <Button leadingIcon="share" variant="secondary">
                With icon
              </Button>
              <Button href="/design" variant="ghost">
                As a link
              </Button>
            </div>
          </Specimen>
        </Section>

        <Section title="StatusChip" note="The text is the message; colour only reinforces it.">
          <div className="flex flex-wrap gap-2">
            {CHIP_TONES.map((tone) => (
              <StatusChip key={tone} tone={tone}>
                {tone}
              </StatusChip>
            ))}
          </div>
        </Section>

        <Section title="Banner">
          <Banner tone="info" title="Confirms Wed 24 Sep, 19:00 if 6 or more are in.">
            Until then you can drop out for free.
          </Banner>
          <Banner tone="success" title="You’re in" action={<button type="button">Change</button>}>
            Drop out for free until the game is confirmed.
          </Banner>
          <Banner tone="warning" title="You’ve paid €8.00">
            You won’t get an automatic refund. The organizer can still refund you.
          </Banner>
          <Banner tone="danger" title="Couldn’t join">
            Someone just took the last spot.
          </Banner>
        </Section>

        <Section title="Form controls">
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label="Default" placeholder="Placeholder" helper="Helper text" />
            <TextField label="With error" defaultValue="+353" error="That doesn’t look like a phone number." />
            <TextField label="Disabled" defaultValue="Locked" disabled />
            <TextField label="Date" type="date" />
          </div>
          <TextArea label="Description (optional)" />
          <SegmentedControl
            label="Pricing mode"
            value={segment}
            onChange={setSegment}
            options={[
              { value: "FIXED_PER_HEAD", label: "Fixed per person" },
              { value: "SPLIT_EVENLY", label: "Split the cost" },
            ]}
          />
          <Stepper label="Min players" hint="Game confirms once this many are in" value={players} onChange={setPlayers} min={1} />
          <ToggleRow label="Confirm automatically" description="Off: you confirm it yourself." checked={toggle} onChange={setToggle} />
          <div className="flex flex-col gap-3">
            <OptionCard
              name="pay"
              value="wallet"
              checked={payment === "wallet"}
              onChange={() => setPayment("wallet")}
              title="Wallet"
              description="No service fee. We’ll hold €8.00 until the game confirms."
              trailing="€34.00"
            />
            <OptionCard
              name="pay"
              value="cash"
              checked={payment === "cash"}
              onChange={() => setPayment("cash")}
              title="Cash on the day"
              description="Pay the organizer in person. No fee."
            />
            <OptionCard name="pay" value="card" checked={false} onChange={() => {}} title="Card" description="Coming soon" disabled />
          </div>
        </Section>

        <Section title="Game display">
          <HeadcountBar count={4} min={6} max={12} />
          <HeadcountBar count={8} min={6} max={12} />
          <HeadcountBar count={12} min={6} max={12} />
          <HeadcountBar count={8} min={6} max={null} />
          <EventCard
            href="/design"
            when="Thu 25 Sep · 19:00"
            title="Thursday 5-a-side"
            status={{ label: "Game on", tone: "success" }}
            headcount="8/12 in"
            price="€8.00 each"
            mine={{ label: "You’re in", tone: "success" }}
          />
          <KeyFact icon="calendar" primary="Thu 25 Sep · 19:00–20:30" secondary="in 2 days" />
          <KeyFact icon="pin" primary="Westside Sports Hall" secondary="Open in Maps" href="https://maps.google.com" />
          <PriceBlock
            amount="€6.67–€10.00 each"
            note="Court costs €80, split between everyone who plays. Final price is set when the game confirms."
            fee="Pay the organizer in cash on the day · no fee"
          />
        </Section>

        <Section title="People">
          <div>
            <PersonRow name="Conor B." trailing={<StatusChip tone="accent">Organizer</StatusChip>} />
            <PersonRow name="Aoife M." />
            <PersonRow name="Seán O." trailing="#2" />
            <div className="flex gap-3 py-2">
              <Avatar name="Westside 5-a-side" />
              <Avatar name="Padel" size="lg" />
            </div>
          </div>
          <Specimen label="Manage rows — informational; open ••• (tap the row) for actions">
            <div className="rounded-lg border border-border-default bg-bg-surface">
              <PersonManageRow
                name="Priya K."
                detail="Cash · €8.00 to collect"
                tone="warning"
                items={[
                  { label: "Mark as paid (cash received)", description: "Records the €8.00 you collected. You can undo it.", tone: "primary", onSelect: () => toast({ message: "Priya K. marked as paid", actionLabel: "Undo" }) },
                  { label: "Mark as no-show", description: "Counts against them in this group. You can undo it.", tone: "primary" },
                  { label: "Message player", href: "https://wa.me/", external: true },
                ]}
              />
              <PersonManageRow name="Mia R." detail="Owes €8.00 · card declined" tone="danger" items={[{ label: "Mark as paid outside app", tone: "primary" }]} />
              <PersonManageRow name="Aoife M." detail="Paid online · €8.00" items={[{ label: "Message player" }, { label: "Remove from game", tone: "danger", description: "Their spot goes to the waitlist." }]} />
              <PersonManageRow name="Conor B. (you)" detail="Organizer" items={[]} />
            </div>
          </Specimen>
          <div className="flex gap-2 overflow-x-auto">
            {["all", "owes", "cash"].map((key) => (
              <FilterChip key={key} selected={filter === key} onClick={() => setFilter(key)}>
                {key === "all" ? "All · 8" : key === "owes" ? "Owes · 1" : "Cash · 2"}
              </FilterChip>
            ))}
          </div>
        </Section>

        <Section title="Navigation & layout">
          <Specimen label="TopBar · brand">
            <div className="rounded-lg border border-border-default">
              <TopBar brand actions={<Button variant="ghost">Sign in</Button>} />
            </div>
          </Specimen>
          <Specimen label="TopBar · page">
            <div className="rounded-lg border border-border-default">
              <TopBar backHref="/design" title="Thursday 5-a-side" actions={<IconButton icon="share" label="Share" onClick={() => {}} />} />
            </div>
          </Specimen>
          <Specimen label="ActionMenu with ••• trigger">
            <div className="flex justify-end">
              <ActionMenu label="Game options" triggerClassName={ICON_BUTTON_CLASS} items={[{ label: "Edit game" }, { label: "Repeat this game", description: "A new game with the same details, one week later." }, { label: "Cancel game", tone: "danger" }]}>
                <Icon name="more" />
              </ActionMenu>
            </div>
          </Specimen>
          <Specimen label="SectionHeader">
            <SectionHeader title="Who’s in · 8" action={{ label: "Show all 8", onClick: () => {} }} />
          </Specimen>
          <Specimen label="StickyActionBar">
            <div className="overflow-hidden rounded-lg border border-border-default">
              <StickyActionBar context="Nothing charged now · drop out free until it’s confirmed">
                <Button size="lg" fullWidth>
                  I’m in
                </Button>
              </StickyActionBar>
            </div>
          </Specimen>
          <Specimen label="TabBar (not mounted yet)">
            <div className="overflow-hidden rounded-lg border border-border-default">
              <TabBar
                items={[
                  { href: "/", label: "Games", icon: "games", active: true },
                  { href: "/wallet", label: "Wallet", icon: "wallet", active: false },
                  { href: "/me", label: "Me", icon: "user", active: false },
                ]}
              />
            </div>
          </Specimen>
          <EmptyState icon="calendar" title="No games yet" description="Create the first game and share the link in your group chat." action={<Button leadingIcon="plus">Create the first game</Button>} />
          <Specimen label="Skeleton">
            <div className="flex flex-col gap-2">
              <Skeleton className="h-8 w-2/3" />
              <Skeleton className="h-24 w-full" />
            </div>
          </Specimen>
        </Section>

        <Section title="Feedback & overlays">
          <div className="flex flex-wrap gap-3">
            <Button variant="secondary" onClick={() => toast({ message: "Marked as paid outside app", actionLabel: "Undo" })}>
              Toast with Undo
            </Button>
            <Button variant="secondary" onClick={() => toast({ message: "Couldn’t save", tone: "error" })}>
              Error toast
            </Button>
            <Button variant="secondary" onClick={() => setSheet("sheet")}>
              BottomSheet
            </Button>
            <Button variant="secondary" onClick={() => setSheet("confirm")}>
              ConfirmSheet
            </Button>
            <Button variant="secondary" onClick={() => setSheet("share")}>
              ShareSheet
            </Button>
          </div>
          <LinkField url="https://example.com/e/thursday-5-a-side-25-sep" />
        </Section>
      </div>

      <BottomSheet open={sheet === "sheet"} onClose={() => setSheet("none")} title="How do you want to pay?">
        <OptionCard name="sheet-pay" value="cash" checked onChange={() => {}} title="Cash on the day" description="Pay the organizer in person. No fee." trailing="€8.00" />
        <Button size="lg" fullWidth>
          Join — nothing charged now
        </Button>
      </BottomSheet>
      <ConfirmSheet
        open={sheet === "confirm"}
        onClose={() => setSheet("none")}
        title="Remove Aoife M. from the game?"
        tone="destructive"
        banner={{ tone: "warning", title: "Their spot is released", body: "Nothing has been charged. Their spot goes to the waitlist." }}
        confirmLabel="Remove Aoife M."
        cancelLabel="Keep in game"
        onConfirm={() => setSheet("none")}
      />
      <ShareSheet
        open={sheet === "share"}
        onClose={() => setSheet("none")}
        title="Share this game"
        url="https://example.com/e/thursday-5-a-side-25-sep"
        message="Thursday 5-a-side · Thu 25 Sep · 19:00"
        preview={<SharePreview title="Thursday 5-a-side" details="Thu 25 Sep · 19:00 · Westside Sports Hall" summary="8 in · 4 spots left · €8.00 each" />}
      />
    </div>
  );
}
