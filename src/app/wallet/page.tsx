"use client";

import { useState } from "react";
import { Banner, Button, EmptyState, OptionCard, Screen, ScreenSkeleton, SectionHeader, TopBar, useToast } from "@/components/ui";
import { MainTabBar } from "@/app/_components/MainTabBar";
import { CardForm } from "@/app/_components/CardForm";
import { SignInSheet } from "@/app/_components/SignInSheet";
import { useRequireAuth } from "@/app/_components/useRequireAuth";
import { formatCents } from "@/lib/format";
import { trpc } from "@/lib/trpc/client";

/**
 * UI spec §8: the wallet. Balance, what's set aside for games, and top-up in
 * fixed amounts with the stepped fee shown up front and paid on top — pay
 * €21, get €20. Top-ups that would pass the €150 cap aren't offered.
 */
export default function WalletPage() {
  const toast = useToast();
  const utils = trpc.useUtils();
  const { me, requireAuth, signInSheetProps } = useRequireAuth();
  const { data: wallet, isLoading } = trpc.wallet.summary.useQuery(undefined, { enabled: !!me });
  const [amountCents, setAmountCents] = useState<number | null>(null);
  const [payment, setPayment] = useState<{ paymentId: string; clientSecret: string; totalCents: number } | null>(null);

  const startTopUp = trpc.wallet.startTopUp.useMutation({ onSuccess: setPayment });
  const completeTopUp = trpc.wallet.completeTopUp.useMutation({
    onSuccess: (result) => {
      if (result.status === "succeeded") {
        toast({ message: "Wallet topped up" });
      } else if (result.status === "refunded") {
        toast({ message: "That would have gone over the max balance — you were refunded", tone: "error" });
      } else {
        toast({ message: "The payment didn’t go through", tone: "error" });
      }
      setPayment(null);
      setAmountCents(null);
      return utils.wallet.summary.invalidate();
    },
  });

  const topBar = <TopBar brand />;

  if (!me) {
    return (
      <Screen topBar={topBar}>
        <EmptyState
          icon="lock"
          title="Sign in to see your wallet"
          action={<Button onClick={() => requireAuth(() => {})}>Sign in</Button>}
        />
        <SignInSheet {...signInSheetProps} />
      </Screen>
    );
  }

  if (isLoading || !wallet) {
    return <ScreenSkeleton backHref="/" />;
  }

  if (!wallet.enabled) {
    return (
      <Screen topBar={topBar}>
        <EmptyState icon="info" title="The wallet isn’t available yet" description="You can still pay for games by card or cash." />
      </Screen>
    );
  }

  if (payment) {
    return (
      <Screen topBar={<TopBar backHref="/" title="Top up" />}>
        <Banner tone="info" title={`You pay ${formatCents(payment.totalCents)} now`}>
          It goes straight onto your wallet, less the fee shown on the previous step.
        </Banner>
        <CardForm
          kind="payment"
          clientSecret={payment.clientSecret}
          submitLabel={`Pay ${formatCents(payment.totalCents)}`}
          onDone={() => completeTopUp.mutate({ paymentId: payment.paymentId })}
          onBack={() => setPayment(null)}
        />
      </Screen>
    );
  }

  const chosen = wallet.topUpOptions.find((option) => option.amountCents === amountCents);

  return (
    <Screen topBar={topBar} actionBar={<MainTabBar active="wallet" />} className="gap-6">
      <div className="flex flex-col gap-1 rounded-lg border border-border-default bg-bg-surface p-4">
        <p className="text-caption text-text-tertiary">BALANCE</p>
        <p className="text-number text-text-primary">{formatCents(wallet.balanceCents)}</p>
        <p className="text-small text-text-secondary">
          {wallet.heldCents > 0
            ? `${formatCents(wallet.heldCents)} is set aside for games you’ve joined · ${formatCents(wallet.availableCents)} available`
            : "Nothing set aside for games"}
        </p>
        <p className="text-caption font-normal text-text-tertiary">
          No service fee when you pay for a game from your wallet. Maximum balance {formatCents(wallet.maxBalanceCents)}.
        </p>
      </div>

      <section className="flex flex-col gap-3">
        <SectionHeader title="Top up" />
        {wallet.topUpOptions.length === 0 ? (
          <Banner tone="info" title="You’re at the maximum balance">
            Use some on games and you can top up again.
          </Banner>
        ) : (
          wallet.topUpOptions.map((option) => (
            <OptionCard
              key={option.amountCents}
              name="top-up"
              value={String(option.amountCents)}
              checked={amountCents === option.amountCents}
              onChange={() => setAmountCents(option.amountCents)}
              title={formatCents(option.amountCents)}
              description={`+ ${formatCents(option.feeCents)} fee · you pay ${formatCents(option.totalCents)}`}
            />
          ))
        )}
        {wallet.topUpOptions.length > 0 && wallet.topUpOptions.length < 3 && (
          <p className="text-small text-text-secondary">Larger top-ups would go over the {formatCents(wallet.maxBalanceCents)} maximum balance.</p>
        )}
        {startTopUp.error && (
          <Banner tone="danger" title="Couldn’t start the top-up">
            {startTopUp.error.message}
          </Banner>
        )}
        <Button
          size="lg"
          fullWidth
          disabled={!chosen}
          loading={startTopUp.isPending}
          onClick={() => chosen && startTopUp.mutate({ amountCents: chosen.amountCents })}
        >
          {chosen ? `Continue — pay ${formatCents(chosen.totalCents)}` : "Choose an amount"}
        </Button>
      </section>
    </Screen>
  );
}
