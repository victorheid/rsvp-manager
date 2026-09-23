"use client";

import { useState } from "react";
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

/**
 * Where the card details are entered — for now a stand-in for Stripe's card
 * element, since no real payment provider is wired up yet (specs/tasks.md
 * §0). It lets you pick how the pretend card behaves, so every path (works,
 * declined, needs 3-D Secure…) can be tried. When the real adapter lands,
 * this is the one component that becomes Stripe Elements: it keeps the same
 * props, and `onDone` still means "the provider has the card / the payment".
 */
export interface CardFormProps {
  /** `setup` saves a card for later; `payment` pays now. */
  kind: "setup" | "payment";
  clientSecret: string;
  submitLabel: string;
  onDone: () => void;
  onBack?: () => void;
}

export function CardForm({ kind, clientSecret, submitLabel, onDone, onBack }: CardFormProps) {
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
