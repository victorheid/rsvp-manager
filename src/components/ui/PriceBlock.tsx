import type { ReactNode } from "react";

/**
 * The price card on the event page: the amount large, one paragraph saying
 * how it's worked out, and the fee line small underneath. Every screen that
 * touches money states the amount, the fee and when it's charged before the
 * tap that commits (UI spec §1) — this is where the first two live.
 */
export interface PriceBlockProps {
  /** "€8.00 each", "€6.67–€10.00 each". */
  amount: string;
  /** How it's worked out, e.g. the split-cost explanation. */
  note?: ReactNode;
  /** The fee line, e.g. "+ €0.50 service fee by card · no fee with wallet or cash". */
  fee?: ReactNode;
}

export function PriceBlock({ amount, note, fee }: PriceBlockProps) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-border-default bg-bg-surface p-4">
      <p className="text-caption text-text-tertiary">PRICE</p>
      <p className="text-number text-text-primary">{amount}</p>
      {note && <p className="text-small text-text-secondary">{note}</p>}
      {fee && <p className="text-caption font-normal text-text-tertiary">{fee}</p>}
    </div>
  );
}
