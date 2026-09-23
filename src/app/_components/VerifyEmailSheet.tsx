"use client";

import { useState } from "react";
import { Banner, BottomSheet, Button, TextField } from "@/components/ui";
import { trpc } from "@/lib/trpc/client";

/**
 * Verify an email (two steps: address, then the 6-digit code we send it).
 * Organizers need one before creating groups or games or setting up payouts;
 * players never do. Get its props from `useRequireVerifiedEmail`.
 */
export interface VerifyEmailSheetProps {
  open: boolean;
  onClose: () => void;
  /** Called once the address is verified. */
  onVerified: () => void;
  /** Why we're asking, e.g. "to create a group". */
  reason?: string;
}

export function VerifyEmailSheet({ open, onClose, onVerified, reason }: VerifyEmailSheetProps) {
  return (
    <BottomSheet open={open} onClose={onClose} title="Verify your email">
      {/* Mounted only while open, so every visit starts back at the address step. */}
      <VerifyEmailSteps onVerified={onVerified} reason={reason} />
    </BottomSheet>
  );
}

function VerifyEmailSteps({ onVerified, reason }: { onVerified: () => void; reason?: string }) {
  const utils = trpc.useUtils();
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const request = trpc.auth.requestEmailVerification.useMutation({ onSuccess: () => setStep("code") });
  const verify = trpc.auth.verifyEmail.useMutation({
    onSuccess: async () => {
      await utils.auth.account.invalidate();
      onVerified();
    },
    onError: () => setCode(""),
  });

  if (step === "email") {
    return (
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          request.mutate({ email });
        }}
      >
        <p className="text-body text-text-secondary">
          Organizers add an email {reason ?? "to run games"}. It’s how we help you get back in if you lose or change your phone number. Players don’t need one.
        </p>
        <TextField label="Email" type="email" autoComplete="email" required autoFocus value={email} onChange={(event) => setEmail(event.target.value)} />
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

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        verify.mutate({ code });
      }}
    >
      <TextField
        label="6-digit code"
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        required
        autoFocus
        value={code}
        onChange={(event) => {
          const digits = event.target.value.replace(/\D/g, "");
          setCode(digits);
          if (digits.length === 6) verify.mutate({ code: digits });
        }}
        className="text-center text-title tracking-[0.5em]"
        helper={`We emailed a code to ${email}.`}
      />
      {verify.error && (
        <Banner tone="danger" title="That code didn’t work">
          {verify.error.message}
        </Banner>
      )}
      <Button type="submit" size="lg" fullWidth loading={verify.isPending} disabled={code.length !== 6}>
        Verify
      </Button>
      <Button variant="ghost" fullWidth onClick={() => setStep("email")}>
        Use a different email
      </Button>
    </form>
  );
}
