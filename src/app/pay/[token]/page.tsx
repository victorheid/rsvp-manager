"use client";

import Link from "next/link";
import { useState } from "react";
import { useParams } from "next/navigation";
import { Banner, Button, EmptyState, Screen, ScreenSkeleton, TopBar } from "@/components/ui";
import { CardForm } from "@/app/_components/CardForm";
import { SignInSheet } from "@/app/_components/SignInSheet";
import { useRequireAuth } from "@/app/_components/useRequireAuth";
import { formatCents, formatDateTime } from "@/lib/format";
import { trpc } from "@/lib/trpc/client";

/**
 * UI spec §7.6: pay what a failed card charge left owing. Reached from the
 * "payment didn't go through" push or text. Shows exactly what was owed —
 * the price and the fee as first charged — then takes a card. Signing in is
 * required, and only the person who owes can open it.
 */
export default function PayPage() {
  const { token } = useParams<{ token: string }>();
  const utils = trpc.useUtils();
  const { me, requireAuth, signInSheetProps } = useRequireAuth();
  const { data: owed, isLoading, error } = trpc.payments.owed.useQuery({ token }, { enabled: !!me, retry: false });
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [paid, setPaid] = useState(false);

  const start = trpc.payments.startOwedPayment.useMutation({ onSuccess: (result) => setClientSecret(result.clientSecret) });
  const complete = trpc.payments.completeOwedPayment.useMutation({
    onSuccess: (result) => {
      setClientSecret(null);
      if (result.status === "paid") {
        setPaid(true);
        return utils.payments.owed.invalidate();
      }
    },
  });

  const topBar = <TopBar backHref="/" title="Pay" />;

  if (!me) {
    return (
      <Screen topBar={topBar}>
        <EmptyState
          icon="lock"
          title="Sign in to pay"
          description="Use the phone number you joined the game with."
          action={<Button onClick={() => requireAuth(() => {})}>Sign in</Button>}
        />
        <SignInSheet {...signInSheetProps} />
      </Screen>
    );
  }

  if (paid) {
    return (
      <Screen topBar={topBar}>
        <EmptyState icon="check" title="Paid — thank you" description="You’re all set for the game." action={<Button href="/">Back to your games</Button>} />
      </Screen>
    );
  }

  if (isLoading) {
    return <ScreenSkeleton backHref="/" />;
  }

  if (error || !owed) {
    return (
      <Screen topBar={topBar}>
        <EmptyState
          icon="info"
          title="Nothing to pay here"
          description={error?.message === "NOT_FOUND" ? "This link is for someone else, or it’s no longer valid." : (error?.message ?? "You’re all paid up.")}
          action={<Button href="/">Back to your games</Button>}
        />
      </Screen>
    );
  }

  if (clientSecret) {
    return (
      <Screen topBar={topBar}>
        <CardForm
          kind="payment"
          clientSecret={clientSecret}
          submitLabel={`Pay ${formatCents(owed.totalCents)}`}
          onDone={() => complete.mutate({ token })}
          onBack={() => setClientSecret(null)}
        />
        {complete.data?.status === "failed" && (
          <Banner tone="danger" title="That payment didn’t go through">
            Try another card.
          </Banner>
        )}
      </Screen>
    );
  }

  return (
    <Screen topBar={topBar} className="gap-5">
      <div className="flex flex-col gap-1">
        <h2 className="text-title text-text-primary">You owe {formatCents(owed.totalCents)}</h2>
        <p className="text-small text-text-secondary">
          For{" "}
          <Link href={`/e/${owed.event.slug}`} className="text-text-link">
            {owed.event.title}
          </Link>{" "}
          · {formatDateTime(new Date(owed.event.startsAt))}
        </p>
      </div>
      <div className="flex flex-col gap-2 rounded-lg border border-border-default bg-bg-surface p-4 text-body text-text-primary">
        <div className="flex justify-between">
          <span>Game</span>
          <span>{formatCents(owed.priceCents)}</span>
        </div>
        <div className="flex justify-between text-text-secondary">
          <span>Service fee</span>
          <span>{formatCents(owed.feeCents)}</span>
        </div>
        <div className="flex justify-between border-t border-border-default pt-2 text-body-strong">
          <span>Total</span>
          <span>{formatCents(owed.totalCents)}</span>
        </div>
      </div>
      {(start.error || complete.error) && (
        <Banner tone="danger" title="Couldn’t start the payment">
          {(start.error ?? complete.error)?.message}
        </Banner>
      )}
      <Button size="lg" fullWidth loading={start.isPending} onClick={() => start.mutate({ token })}>
        Pay {formatCents(owed.totalCents)}
      </Button>
    </Screen>
  );
}
