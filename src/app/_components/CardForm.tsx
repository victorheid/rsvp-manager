"use client";

import { useMemo, useState, type FormEvent } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { Banner, Button, OptionCard } from "@/components/ui";
import { trpc } from "@/lib/trpc/client";
import { FAKE_CARD_SCENARIOS } from "@/server/integrations/stripe/fake-scenarios";

type Scenario = (typeof FAKE_CARD_SCENARIOS)[number];

const SCENARIO_COPY: Record<Scenario, { title: string; description: string }> = {
  visa: { title: "Visa •••• 4242", description: "Works" },
  requires_action: { title: "Visa •••• 3155", description: "Asks for 3-D Secure, which you pass" },
  declined: { title: "Visa •••• 0002", description: "Is declined" },
  expired: { title: "Visa •••• 0069", description: "Has expired" },
  insufficient_funds: { title: "Visa •••• 9995", description: "Has insufficient funds" },
};

const PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;

/**
 * Where the card details are entered. With a Stripe publishable key it's
 * Stripe's own Payment Element (card number, 3-D Secure and all — card data
 * never touches our servers); without one it's a test-mode stand-in for the
 * in-memory fake gateway, where you pick how the pretend card behaves.
 * Either way `onDone` means "the provider has the card / the payment": the
 * caller then asks the server, which checks with the provider itself.
 */
export interface CardFormProps {
  /** `setup` saves a card for later; `payment` pays now. */
  kind: "setup" | "payment";
  clientSecret: string;
  submitLabel: string;
  onDone: () => void;
  onBack?: () => void;
}

export function CardForm(props: CardFormProps) {
  return PUBLISHABLE_KEY ? <StripeCardForm {...props} publishableKey={PUBLISHABLE_KEY} /> : <FakeCardForm {...props} />;
}

function StripeCardForm({ kind, clientSecret, submitLabel, onDone, onBack, publishableKey }: CardFormProps & { publishableKey: string }) {
  const stripePromise = useMemo(() => loadStripe(publishableKey), [publishableKey]);

  return (
    <Elements stripe={stripePromise} options={{ clientSecret }}>
      <StripePaymentFields kind={kind} submitLabel={submitLabel} onDone={onDone} onBack={onBack} />
    </Elements>
  );
}

function StripePaymentFields({ kind, submitLabel, onDone, onBack }: Pick<CardFormProps, "kind" | "submitLabel" | "onDone" | "onBack">) {
  const stripe = useStripe();
  const elements = useElements();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!stripe || !elements) return;

    setPending(true);
    setError(null);
    // Stay on the page unless the bank forces a redirect; 3-D Secure opens in a modal.
    const result =
      kind === "setup"
        ? await stripe.confirmSetup({ elements, redirect: "if_required" })
        : await stripe.confirmPayment({ elements, redirect: "if_required" });
    setPending(false);

    if (result.error) {
      setError(result.error.message ?? "That card didn’t work. Try another.");
      return;
    }

    onDone();
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={submit}>
      <PaymentElement />
      {error && (
        <Banner tone="danger" title="Couldn’t use that card">
          {error}
        </Banner>
      )}
      <Button type="submit" size="lg" fullWidth loading={pending} disabled={!stripe || !elements}>
        {submitLabel}
      </Button>
      {onBack && (
        <Button variant="ghost" fullWidth onClick={onBack}>
          Back
        </Button>
      )}
    </form>
  );
}

function FakeCardForm({ kind, clientSecret, submitLabel, onDone, onBack }: CardFormProps) {
  const [scenario, setScenario] = useState<Scenario>("visa");
  const complete = trpc.payments.devCompleteIntent.useMutation({ onSuccess: onDone });

  return (
    <div className="flex flex-col gap-3">
      <Banner tone="info" title="Test mode">
        No real card is used or charged. Pick how the test card behaves.
      </Banner>
      {FAKE_CARD_SCENARIOS.map((option) => (
        <OptionCard
          key={option}
          name="test-card"
          value={option}
          checked={scenario === option}
          onChange={() => setScenario(option)}
          title={SCENARIO_COPY[option].title}
          description={SCENARIO_COPY[option].description}
        />
      ))}
      {complete.error && (
        <Banner tone="danger" title="Couldn’t use that card">
          {complete.error.message}
        </Banner>
      )}
      <Button size="lg" fullWidth loading={complete.isPending} onClick={() => complete.mutate({ kind, clientSecret, scenario })}>
        {submitLabel}
      </Button>
      {onBack && (
        <Button variant="ghost" fullWidth onClick={onBack}>
          Back
        </Button>
      )}
    </div>
  );
}
