"use client";

import { Banner, BottomSheet, Button, OptionCard } from "@/components/ui";

/**
 * "How do you want to pay?" (UI spec §7.1). Only cash exists so far
 * (wallet and card wait on §5), so the choice is a single, pre-selected
 * card — the sheet's real job today is stating the consequence before the
 * tap: what's charged now, and what happens if you drop out.
 */
export interface RsvpSheetProps {
  open: boolean;
  onClose: () => void;
  /** The game is already confirmed, so joining means owing the price. */
  confirmed: boolean;
  /** "€8.00" */
  price: string;
  pending: boolean;
  error?: string;
  onJoin: () => void;
}

export function RsvpSheet({ open, onClose, confirmed, price, pending, error, onJoin }: RsvpSheetProps) {
  return (
    <BottomSheet open={open} onClose={onClose} title="How do you want to pay?">
      <OptionCard
        name="payment"
        value="CASH"
        checked
        onChange={() => {}}
        title="Cash on the day"
        description="Pay the organizer in person. No fee."
        trailing={price}
      />
      <p className="text-small text-text-secondary">
        {confirmed
          ? `You’ll pay ${price} in cash on the day. If you drop out later, the organizer may still ask you to pay.`
          : "Nothing is charged now. You can drop out for free until the game is confirmed."}
      </p>
      {error && (
        <Banner tone="danger" title="Couldn’t join">
          {error}
        </Banner>
      )}
      <Button size="lg" fullWidth loading={pending} onClick={onJoin}>
        {confirmed ? `Join — pay ${price} cash` : "Join — nothing charged now"}
      </Button>
    </BottomSheet>
  );
}
