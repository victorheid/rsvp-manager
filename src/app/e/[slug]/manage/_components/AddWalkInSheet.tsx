"use client";

import { useState } from "react";
import { Banner, BottomSheet, Button, SegmentedControl, TextField } from "@/components/ui";

/**
 * "Add walk-in" (UI spec §10.6): someone turning up who isn't using the app.
 * A name and whether they've paid — walk-ins are organizer records, never
 * shown publicly, and they don't count towards the max.
 */
export type WalkInPayment = "PAID_OUTSIDE_APP" | "OWES";

export interface AddWalkInSheetProps {
  open: boolean;
  onClose: () => void;
  pending: boolean;
  error?: string;
  onAdd: (walkIn: { name: string; paymentStatus: WalkInPayment }) => void;
}

export function AddWalkInSheet({ open, onClose, pending, error, onAdd }: AddWalkInSheetProps) {
  return (
    <BottomSheet open={open} onClose={onClose} title="Add walk-in">
      {/* Mounted only while open, so the form starts empty every time. */}
      <WalkInForm pending={pending} error={error} onAdd={onAdd} />
    </BottomSheet>
  );
}

function WalkInForm({ pending, error, onAdd }: Pick<AddWalkInSheetProps, "pending" | "error" | "onAdd">) {
  const [name, setName] = useState("");
  const [paymentStatus, setPaymentStatus] = useState<WalkInPayment>("PAID_OUTSIDE_APP");

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        onAdd({ name: name.trim(), paymentStatus });
      }}
    >
      <TextField
        label="Name"
        required
        autoFocus
        value={name}
        onChange={(event) => setName(event.target.value)}
        helper="Walk-ins don’t count towards the maximum and aren’t shown publicly."
      />
      <SegmentedControl
        label="Payment"
        value={paymentStatus}
        onChange={setPaymentStatus}
        options={[
          { value: "PAID_OUTSIDE_APP", label: "Paid cash" },
          { value: "OWES", label: "Owes" },
        ]}
      />
      {error && (
        <Banner tone="danger" title="Couldn’t add them">
          {error}
        </Banner>
      )}
      <Button type="submit" size="lg" fullWidth loading={pending} disabled={name.trim().length === 0}>
        Add walk-in
      </Button>
    </form>
  );
}
