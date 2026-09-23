"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc/client";

type Step = "phone" | "code" | "name";

/**
 * Phone + SMS code sign-in (UI spec §3). Shown inline wherever an action
 * needs identity; calls `onSuccess` once the session cookie is set.
 */
export function SignInFlow({ onSuccess }: { onSuccess: () => void }) {
  const [step, setStep] = useState<Step>("phone");
  const [phoneNumber, setPhoneNumber] = useState("+353");
  const [code, setCode] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastInitial, setLastInitial] = useState("");
  const [error, setError] = useState<string | null>(null);

  const utils = trpc.useUtils();
  const requestCode = trpc.auth.requestCode.useMutation();
  const verifyCode = trpc.auth.verifyCode.useMutation();

  async function handleRequestCode() {
    setError(null);
    try {
      await requestCode.mutateAsync({ phoneNumber });
      setStep("code");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't send a code. Try again.");
    }
  }

  async function handleVerify(nameFields?: { firstName: string; lastInitial: string }) {
    setError(null);
    try {
      const result = await verifyCode.mutateAsync({ phoneNumber, code, ...nameFields });

      if (result.status === "needs_name") {
        setStep("name");
        return;
      }

      await utils.auth.me.invalidate();
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Incorrect code.");
      setCode("");
    }
  }

  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
      {step === "phone" && (
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void handleRequestCode();
          }}
        >
          <label className="flex flex-col gap-1 text-sm">
            Phone number
            <input
              type="tel"
              autoComplete="tel"
              required
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              className="rounded-md border border-neutral-300 px-3 py-2 text-base dark:border-neutral-700 dark:bg-neutral-800"
            />
          </label>
          <p className="text-xs text-neutral-500">We&apos;ll text you a code.</p>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={requestCode.isPending}
            className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-neutral-900"
          >
            {requestCode.isPending ? "Sending…" : "Send code"}
          </button>
        </form>
      )}

      {step === "code" && (
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void handleVerify();
          }}
        >
          <label className="flex flex-col gap-1 text-sm">
            Code
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              required
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              className="rounded-md border border-neutral-300 px-3 py-2 text-base tracking-widest dark:border-neutral-700 dark:bg-neutral-800"
            />
          </label>
          <p className="text-xs text-neutral-500">
            Sent to {phoneNumber} ·{" "}
            <button type="button" className="underline" onClick={() => setStep("phone")}>
              Change
            </button>
          </p>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={verifyCode.isPending || code.length !== 6}
            className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-neutral-900"
          >
            {verifyCode.isPending ? "Checking…" : "Continue"}
          </button>
        </form>
      )}

      {step === "name" && (
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void handleVerify({ firstName, lastInitial });
          }}
        >
          <label className="flex flex-col gap-1 text-sm">
            First name
            <input
              type="text"
              required
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              className="rounded-md border border-neutral-300 px-3 py-2 text-base dark:border-neutral-700 dark:bg-neutral-800"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Last initial
            <input
              type="text"
              required
              maxLength={1}
              value={lastInitial}
              onChange={(e) => setLastInitial(e.target.value.slice(0, 1).toUpperCase())}
              className="rounded-md border border-neutral-300 px-3 py-2 text-base dark:border-neutral-700 dark:bg-neutral-800"
            />
          </label>
          <p className="text-xs text-neutral-500">
            Others will see you as &ldquo;{firstName || "Aoife"} {lastInitial || "M"}.&rdquo;
          </p>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={verifyCode.isPending || !firstName || !lastInitial}
            className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-neutral-900"
          >
            {verifyCode.isPending ? "Saving…" : "Continue"}
          </button>
        </form>
      )}
    </div>
  );
}
