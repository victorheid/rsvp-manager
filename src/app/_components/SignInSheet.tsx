"use client";

import { useEffect, useState } from "react";
import { Banner, BottomSheet, Button, TextField } from "@/components/ui";
import { trpc } from "@/lib/trpc/client";

type Step = "phone" | "code" | "name";

const RESEND_AFTER_SECONDS = 30;

/**
 * Phone + SMS code sign-in as a bottom sheet (UI spec §3). Shown over
 * whatever the person was doing; when it succeeds the original action
 * resumes — nothing is lost. Get its props from `useRequireAuth`:
 *
 *     const { signInSheetProps } = useRequireAuth();
 *     <SignInSheet {...signInSheetProps} />
 */
export interface SignInSheetProps {
  open: boolean;
  onClose: () => void;
  /** Called once the session cookie is set. */
  onSuccess: () => void;
}

export function SignInSheet({ open, onClose, onSuccess }: SignInSheetProps) {
  return (
    <BottomSheet open={open} onClose={onClose} title="Sign in to continue">
      {/* Mounted only while open, so every visit starts back at the phone step. */}
      <SignInSteps onSuccess={onSuccess} />
    </BottomSheet>
  );
}

function SignInSteps({ onSuccess }: { onSuccess: () => void }) {
  const [step, setStep] = useState<Step>("phone");
  const [phoneNumber, setPhoneNumber] = useState("+353");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [secondsUntilResend, setSecondsUntilResend] = useState(RESEND_AFTER_SECONDS);

  const utils = trpc.useUtils();
  const requestCode = trpc.auth.requestCode.useMutation();
  const verifyCode = trpc.auth.verifyCode.useMutation();

  useEffect(() => {
    if (step !== "code" || secondsUntilResend <= 0) return;
    const timer = setTimeout(() => setSecondsUntilResend((seconds) => seconds - 1), 1000);
    return () => clearTimeout(timer);
  }, [step, secondsUntilResend]);

  async function sendCode() {
    setError(null);
    try {
      await requestCode.mutateAsync({ phoneNumber });
      setSecondsUntilResend(RESEND_AFTER_SECONDS);
      setStep("code");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't send a code. Try again.");
    }
  }

  async function verify(enteredCode: string, nameFields?: { name: string }) {
    setError(null);
    try {
      const result = await verifyCode.mutateAsync({ phoneNumber, code: enteredCode, ...nameFields });

      if (result.status === "needs_name") {
        setStep("name");
        return;
      }

      await utils.auth.me.invalidate();
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That code didn't work. Try again.");
      setCode("");
    }
  }

  const errorBanner = error && (
    <Banner tone="danger" title="Something went wrong">
      {error}
    </Banner>
  );

  if (step === "phone") {
    return (
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          void sendCode();
        }}
      >
        <TextField
          label="Phone number"
          type="tel"
          autoComplete="tel"
          required
          value={phoneNumber}
          onChange={(event) => setPhoneNumber(event.target.value)}
          helper="We’ll text you a code. Your number is only shown to organizers of groups you join."
        />
        {errorBanner}
        <Button type="submit" size="lg" fullWidth loading={requestCode.isPending}>
          Send code
        </Button>
      </form>
    );
  }

  if (step === "code") {
    return (
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          void verify(code);
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
            // Submits itself on the sixth digit (UI spec §3).
            if (digits.length === 6) void verify(digits);
          }}
          className="text-center text-title tracking-[0.5em]"
          helper={
            <>
              Sent to {phoneNumber} ·{" "}
              <button type="button" className="text-text-link underline" onClick={() => setStep("phone")}>
                Change
              </button>
            </>
          }
        />
        {errorBanner}
        <Button type="submit" size="lg" fullWidth loading={verifyCode.isPending} disabled={code.length !== 6}>
          Continue
        </Button>
        <Button
          size="lg"
          fullWidth
          variant="ghost"
          disabled={secondsUntilResend > 0 || requestCode.isPending}
          onClick={() => void sendCode()}
        >
          {secondsUntilResend > 0 ? `Resend code in 0:${String(secondsUntilResend).padStart(2, "0")}` : "Resend code"}
        </Button>
      </form>
    );
  }

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        void verify(code, { name: name.trim() });
      }}
    >
      <TextField
        label="Your name"
        required
        autoFocus
        autoComplete="name"
        maxLength={40}
        value={name}
        onChange={(event) => setName(event.target.value)}
        helper="Your name or a nickname. It’s what others in your groups see."
      />
      {errorBanner}
      <Button
        type="submit"
        size="lg"
        fullWidth
        loading={verifyCode.isPending}
        disabled={!name.trim()}
      >
        Continue
      </Button>
    </form>
  );
}
