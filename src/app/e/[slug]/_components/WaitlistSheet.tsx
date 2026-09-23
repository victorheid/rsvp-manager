"use client";

import { useState } from "react";
import { Banner, BottomSheet, Button, OptionCard } from "@/components/ui";
import { CardForm } from "@/app/_components/CardForm";
import { formatCents } from "@/lib/format";
import { trpc } from "@/lib/trpc/client";

/**
 * Joining the waitlist, or switching how you're on it (UI spec §7.2): "Auto-join
 * and pay" — moved in automatically, paid by wallet or a card saved now — or
 * "Notify me". The copy says what each one does and that auto-join is served
 * first. Nothing is held or charged until you're moved in. Switching keeps
 * your original join time.
 */
export interface WaitlistSheetProps {
  open: boolean;
  onClose: () => void;
  eventId: string;
  /** Auto-join is online-only: cash can't be taken automatically. */
  onlineAllowed: boolean;
  priceCents: number;
  /** Set when already on the waitlist: the sheet then switches mode instead of joining. */
  currentMode?: "AUTO" | "MANUAL";
  onDone: (message: string) => void;
}

type Method = "WALLET" | "CARD";

export function WaitlistSheet({ open, onClose, eventId, onlineAllowed, priceCents, currentMode, onDone }: WaitlistSheetProps) {
  const { data: wallet } = trpc.wallet.summary.useQuery(undefined, { enabled: open && onlineAllowed });
  const walletOffered = wallet?.enabled === true;
  const [mode, setMode] = useState<"AUTO" | "MANUAL">("MANUAL");
  const [method, setMethod] = useState<Method>("CARD");
  const [cardSetup, setCardSetup] = useState<{ setupIntentId: string; clientSecret: string } | null>(null);

  // Start fresh each time it opens (adjusting state while rendering, not in an effect).
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setMode(currentMode === "MANUAL" ? "AUTO" : onlineAllowed && currentMode === undefined ? "AUTO" : "MANUAL");
      setMethod("CARD");
      setCardSetup(null);
    }
  }

  const finish = (message: string) => onDone(message);
  const join = trpc.waitlist.join.useMutation({ onSuccess: () => finish("You’re on the waitlist") });
  const switchMode = trpc.waitlist.setMode.useMutation({ onSuccess: () => finish("Waitlist choice updated") });
  const beginCardSetup = trpc.rsvps.beginCardSetup.useMutation({ onSuccess: setCardSetup });
  const active = currentMode === undefined ? join : switchMode;

  function submit(preference: { mode: "AUTO" | "MANUAL"; paymentMethod?: Method; setupIntentId?: string }) {
    if (currentMode === undefined) join.mutate({ eventId, preference });
    else switchMode.mutate({ eventId, preference });
  }

  if (cardSetup) {
    return (
      <BottomSheet open={open} onClose={onClose} title="Add your card">
        <CardForm
          kind="setup"
          clientSecret={cardSetup.clientSecret}
          submitLabel="Save card and join"
          onDone={() => submit({ mode: "AUTO", paymentMethod: "CARD", setupIntentId: cardSetup.setupIntentId })}
          onBack={() => setCardSetup(null)}
        />
        {active.error && (
          <Banner tone="danger" title="Couldn’t update the waitlist">
            {active.error.message}
          </Banner>
        )}
      </BottomSheet>
    );
  }

  const price = formatCents(priceCents);

  return (
    <BottomSheet open={open} onClose={onClose} title={currentMode === undefined ? "Join the waitlist" : "How should we handle a free spot?"}>
      {onlineAllowed && (
        <OptionCard
          name="waitlist-mode"
          value="AUTO"
          checked={mode === "AUTO"}
          onChange={() => setMode("AUTO")}
          title="Auto-join and pay"
          description="If a spot opens we put you in and pay for you automatically. Auto-join is served before notify-me."
        />
      )}
      {mode === "AUTO" && onlineAllowed && (
        <div className="ml-4 flex flex-col gap-3 border-l-2 border-border-default pl-3">
          {walletOffered && (
            <OptionCard
              name="waitlist-method"
              value="WALLET"
              checked={method === "WALLET"}
              onChange={() => setMethod("WALLET")}
              title="Wallet"
              description={`If your balance can’t cover ${price} when a spot opens, we’ll skip you and tell you.`}
            />
          )}
          <OptionCard
            name="waitlist-method"
            value="CARD"
            checked={method === "CARD" || !walletOffered}
            onChange={() => setMethod("CARD")}
            title="Card"
            description="We save your card now. It’s only charged if you’re moved in and the game is confirmed."
          />
          <p className="text-small text-text-secondary">Cash can’t be paid automatically — choose Notify me to pay cash.</p>
        </div>
      )}
      <OptionCard
        name="waitlist-mode"
        value="MANUAL"
        checked={mode === "MANUAL"}
        onChange={() => setMode("MANUAL")}
        title="Notify me"
        description="If a spot opens we tell you and you decide. First to claim it gets it."
      />
      {active.error && (
        <Banner tone="danger" title="Couldn’t update the waitlist">
          {active.error.message}
        </Banner>
      )}
      {mode === "AUTO" && (method === "CARD" || !walletOffered) ? (
        <Button size="lg" fullWidth loading={beginCardSetup.isPending} onClick={() => beginCardSetup.mutate({ eventId })}>
          Continue — add card
        </Button>
      ) : (
        <Button
          size="lg"
          fullWidth
          loading={active.isPending}
          onClick={() => submit(mode === "AUTO" ? { mode: "AUTO", paymentMethod: "WALLET" } : { mode: "MANUAL" })}
        >
          {currentMode === undefined ? "Join waitlist" : "Save"}
        </Button>
      )}
    </BottomSheet>
  );
}
