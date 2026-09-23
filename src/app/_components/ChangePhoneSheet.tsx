"use client";

import { useState } from "react";
import { Banner, BottomSheet, Button, TextField } from "@/components/ui";
import { trpc } from "@/lib/trpc/client";

/**
 * Change the phone number on your account: a code goes by SMS to the new
 * number and, if you have a verified email, another goes to that email. Your
 * groups, games, wallet and cards all stay with you.
 */
export interface ChangePhoneSheetProps {
  open: boolean;
  onClose: () => void;
  onChanged: (phoneNumber: string) => void;
}

export function ChangePhoneSheet({ open, onClose, onChanged }: ChangePhoneSheetProps) {
  return (
    <BottomSheet open={open} onClose={onClose} title="Change your phone number">
      <ChangePhoneSteps onChanged={onChanged} />
    </BottomSheet>
  );
}

function ChangePhoneSteps({ onChanged }: { onChanged: (phoneNumber: string) => void }) {
  const utils = trpc.useUtils();
  const [step, setStep] = useState<"number" | "codes">("number");
  const [newPhoneNumber, setNewPhoneNumber] = useState("+353");
  const [needsEmailCode, setNeedsEmailCode] = useState(false);
  const [smsCode, setSmsCode] = useState("");
  const [emailCode, setEmailCode] = useState("");
  const request = trpc.auth.requestPhoneChange.useMutation({
    onSuccess: (result) => {
      setNeedsEmailCode(result.needsEmailCode);
      setStep("codes");
    },
  });
  const confirm = trpc.auth.confirmPhoneChange.useMutation({
    onSuccess: async (result) => {
      await Promise.all([utils.auth.me.invalidate(), utils.auth.account.invalidate()]);
      onChanged(result.phoneNumber);
    },
  });

  if (step === "number") {
    return (
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          request.mutate({ newPhoneNumber });
        }}
      >
        <p className="text-body text-text-secondary">Everything stays with your account: groups, games, wallet and saved cards.</p>
        <TextField label="New phone number" type="tel" autoComplete="tel" required autoFocus value={newPhoneNumber} onChange={(event) => setNewPhoneNumber(event.target.value)} />
        {request.error && (
          <Banner tone="danger" title="Couldn’t send the code">
            {request.error.message}
          </Banner>
        )}
        <Button type="submit" size="lg" fullWidth loading={request.isPending}>
          Send code
        </Button>
      </form>
    );
  }

  const digitsOnly = (value: string) => value.replace(/\D/g, "");

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        confirm.mutate({ newPhoneNumber, smsCode, emailCode: needsEmailCode ? emailCode : undefined });
      }}
    >
      <TextField
        label={`Code texted to ${newPhoneNumber}`}
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        required
        autoFocus
        value={smsCode}
        onChange={(event) => setSmsCode(digitsOnly(event.target.value))}
      />
      {needsEmailCode && (
        <TextField label="Code emailed to you" inputMode="numeric" maxLength={6} required value={emailCode} onChange={(event) => setEmailCode(digitsOnly(event.target.value))} />
      )}
      {confirm.error && (
        <Banner tone="danger" title="That didn’t work">
          {confirm.error.message}
        </Banner>
      )}
      <Button type="submit" size="lg" fullWidth loading={confirm.isPending} disabled={smsCode.length !== 6 || (needsEmailCode && emailCode.length !== 6)}>
        Change number
      </Button>
    </form>
  );
}
