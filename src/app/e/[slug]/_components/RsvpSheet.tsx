"use client";

import Link from "next/link";
import { useState } from "react";
import { Banner, BottomSheet, Button, OptionCard } from "@/components/ui";
import { trpc } from "@/lib/trpc/client";
import { formatCents } from "@/lib/format";
import { CardForm } from "@/app/_components/CardForm";

/**
 * "How do you want to pay?" (UI spec §7.1): wallet, card or cash, whichever
 * the game allows. Each choice states what it costs and when it's charged
 * before the tap — nothing is charged for RSVPing itself (§5). Card is two
 * steps: pick it, then save the card (nothing is charged until the game
 * confirms, or right away if it already has).
 */
export type RsvpPaymentChoice = "WALLET" | "CARD" | "CASH";

export interface RsvpSheetProps {
  open: boolean;
  eventId: string;
  onClose: () => void;
  cashAllowed: boolean;
  onlineAllowed: boolean;
  /** The game is already confirmed, so joining means paying the locked price now. */
  confirmed: boolean;
  /** The price to pay — or, for a split game that hasn't confirmed, the most it could be. */
  priceCents: number;
  /** The service fee a card payment adds; wallet and cash carry none. */
  cardFeeCents: number;
  pending: boolean;
  error?: string;
  onJoin: (input: { paymentMethod: RsvpPaymentChoice; setupIntentId?: string }) => void;
}

export function RsvpSheet(props: RsvpSheetProps) {
  const { open, onClose, cashAllowed, onlineAllowed, confirmed, priceCents, cardFeeCents, pending, error, onJoin } = props;
  const price = formatCents(priceCents);
  const fee = formatCents(cardFeeCents);
  const { data: wallet } = trpc.wallet.summary.useQuery(undefined, { enabled: open && onlineAllowed });
  const walletOffered = onlineAllowed && wallet?.enabled === true;
  const walletCovers = wallet ? wallet.availableCents >= priceCents : false;

  const [choice, setChoice] = useState<RsvpPaymentChoice | null>(null);
  const [cardSetup, setCardSetup] = useState<{ setupIntentId: string; clientSecret: string } | null>(null);
  const beginCardSetup = trpc.rsvps.beginCardSetup.useMutation({ onSuccess: setCardSetup });

  // Start fresh each time it opens (adjusting state while rendering, not in an effect).
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setCardSetup(null);
      setChoice(null);
    }
  }

  const selected: RsvpPaymentChoice | null =
    choice ?? (walletOffered && walletCovers ? "WALLET" : onlineAllowed ? "CARD" : cashAllowed ? "CASH" : null);

  const consequence =
    selected === "WALLET"
      ? confirmed
        ? `${price} comes out of your wallet now.`
        : `${price} is set aside in your wallet, not taken. It’s taken when the game confirms, and released if you drop out first.`
      : selected === "CARD"
        ? confirmed
          ? `Your card is charged ${formatCents(priceCents + cardFeeCents)} now (${price} + ${fee} service fee).`
          : `Your card is saved, not charged. It’s charged ${formatCents(priceCents + cardFeeCents)} when the game confirms (${price} + ${fee} service fee). Drop out for free until then.`
        : confirmed
          ? `You’ll pay ${price} in cash on the day. If you drop out later, the organizer may still ask you to pay.`
          : "Nothing is charged now. You can drop out for free until the game is confirmed.";

  if (cardSetup) {
    return (
      <BottomSheet open={open} onClose={onClose} title="Add your card">
        <CardForm
          kind="setup"
          clientSecret={cardSetup.clientSecret}
          submitLabel="Save card"
          onDone={() => onJoin({ paymentMethod: "CARD", setupIntentId: cardSetup.setupIntentId })}
          onBack={() => setCardSetup(null)}
        />
        {error && (
          <Banner tone="danger" title="Couldn’t join">
            {error}
          </Banner>
        )}
        {pending && <p className="text-small text-text-secondary">Joining…</p>}
      </BottomSheet>
    );
  }

  return (
    <BottomSheet open={open} onClose={onClose} title="How do you want to pay?">
      {walletOffered && (
        <OptionCard
          name="payment"
          value="WALLET"
          checked={selected === "WALLET"}
          onChange={() => setChoice("WALLET")}
          disabled={!walletCovers}
          title="Wallet"
          description={
            walletCovers ? (
              <>No service fee · {formatCents(wallet?.availableCents ?? 0)} available</>
            ) : (
              <>
                {formatCents(wallet?.availableCents ?? 0)} available —{" "}
                <Link href="/wallet" className="text-text-link">
                  top up
                </Link>{" "}
                to use it
              </>
            )
          }
          trailing={price}
        />
      )}
      {onlineAllowed && (
        <OptionCard
          name="payment"
          value="CARD"
          checked={selected === "CARD"}
          onChange={() => setChoice("CARD")}
          title="Card"
          description={
            <>
              {price} + {fee} service fee
              {walletOffered && (
                <>
                  {" "}
                  · <Link href="/wallet" className="text-text-link">pay from your wallet</Link> to skip it
                </>
              )}
            </>
          }
          trailing={formatCents(priceCents + cardFeeCents)}
        />
      )}
      {cashAllowed && (
        <OptionCard
          name="payment"
          value="CASH"
          checked={selected === "CASH"}
          onChange={() => setChoice("CASH")}
          title="Cash on the day"
          description="Pay the organizer in person. No fee."
          trailing={price}
        />
      )}
      <p className="text-small text-text-secondary">{consequence}</p>
      {(error || beginCardSetup.error) && (
        <Banner tone="danger" title="Couldn’t join">
          {error ?? beginCardSetup.error?.message}
        </Banner>
      )}
      {selected === "CARD" ? (
        <Button size="lg" fullWidth loading={beginCardSetup.isPending} onClick={() => beginCardSetup.mutate({ eventId: props.eventId })}>
          Continue — add card
        </Button>
      ) : (
        <Button size="lg" fullWidth disabled={selected === null} loading={pending} onClick={() => selected && onJoin({ paymentMethod: selected })}>
          {selected === "WALLET"
            ? confirmed
              ? `Join — pay ${price} from wallet`
              : "Join — set aside from wallet"
            : confirmed
              ? `Join — pay ${price} cash`
              : "Join — nothing charged now"}
        </Button>
      )}
    </BottomSheet>
  );
}
