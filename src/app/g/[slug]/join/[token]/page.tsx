"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { Banner, Button, EmptyState, Screen, ScreenSkeleton, StatusChip, StickyActionBar, TopBar, useToast } from "@/components/ui";
import { trpc } from "@/lib/trpc/client";
import { SignInSheet } from "@/app/_components/SignInSheet";
import { useRequireAuth } from "@/app/_components/useRequireAuth";

/**
 * The invite link an organizer shares (§1): `/g/{slug}/join/{token}`, the
 * only way into a group. Shows what the group is, then one tap to join
 * (signing in first if needed). An expired or reset link says to ask for a
 * new one; someone already in goes straight to the group.
 */
export default function JoinGroupPage() {
  const { slug, token } = useParams<{ slug: string; token: string }>();
  const router = useRouter();
  const toast = useToast();
  const utils = trpc.useUtils();
  const { data: invite, isLoading, error } = trpc.groups.invite.useQuery({ slug, token });
  const { requireAuth, signInSheetProps } = useRequireAuth();

  const join = trpc.groups.join.useMutation({
    onSuccess: async () => {
      await utils.groups.invalidate();
      toast({ message: `You joined ${invite?.name ?? "the group"}` });
      router.push(`/g/${slug}`);
    },
  });

  useEffect(() => {
    if (invite?.isMember) router.replace(`/g/${slug}`);
  }, [invite?.isMember, router, slug]);

  if (isLoading || invite?.isMember) {
    return <ScreenSkeleton backHref="/" />;
  }

  const topBar = <TopBar backHref="/" title="Invite" />;

  if (error || !invite) {
    return (
      <Screen topBar={topBar}>
        <EmptyState icon="info" title="Group not found" description="Check the link, or ask the organizer to send it again." />
      </Screen>
    );
  }

  if (invite.status !== "VALID") {
    return (
      <Screen topBar={topBar}>
        <h2 className="text-display text-text-primary">{invite.name}</h2>
        <EmptyState
          icon="lock"
          title={invite.status === "EXPIRED" ? "This invite link has expired" : "This invite link no longer works"}
          description={`Ask ${invite.organizerName} for a new one.`}
        />
      </Screen>
    );
  }

  return (
    <Screen
      topBar={topBar}
      actionBar={
        <StickyActionBar context="See the group’s games and hear when new ones are posted">
          <Button size="lg" fullWidth loading={join.isPending} onClick={() => requireAuth(() => join.mutate({ slug, token }))}>
            Join group
          </Button>
        </StickyActionBar>
      }
    >
      <div className="flex flex-col gap-2">
        <p className="text-small text-text-secondary">{invite.organizerName} invited you to join</p>
        <h2 className="text-display text-text-primary">{invite.name}</h2>
        {invite.description && <p className="text-body text-text-secondary">{invite.description}</p>}
        {invite.memberCount !== null && (
          <div className="flex flex-wrap items-center gap-2">
            <StatusChip>
              {invite.memberCount} {invite.memberCount === 1 ? "member" : "members"}
            </StatusChip>
          </div>
        )}
      </div>
      {join.error && (
        <Banner tone="danger" title="Couldn’t join">
          {join.error.message}
        </Banner>
      )}
      <SignInSheet {...signInSheetProps} />
    </Screen>
  );
}
