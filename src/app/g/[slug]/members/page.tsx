"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Banner,
  Button,
  ConfirmSheet,
  EmptyState,
  LinkField,
  PersonManageRow,
  Screen,
  ScreenSkeleton,
  SectionHeader,
  SegmentedControl,
  SharePreview,
  ShareSheet,
  TopBar,
  useToast,
} from "@/components/ui";
import { trpc } from "@/lib/trpc/client";
import { formatDateTime } from "@/lib/format";
import type { RouterInputs, RouterOutputs } from "@/lib/trpc/types";
import { SignInSheet } from "@/app/_components/SignInSheet";
import { useOrigin } from "@/app/_components/useOrigin";
import { useRequireAuth } from "@/app/_components/useRequireAuth";

type MemberGroup = Extract<RouterOutputs["groups"]["getBySlug"], { access: "MEMBER" }>;
type Member = RouterOutputs["groups"]["members"]["members"][number];
type InviteExpiry = RouterInputs["groups"]["updateInvite"]["expiry"];

const EXPIRY_OPTIONS = [
  { value: "never", label: "Never" },
  { value: "24h", label: "24 hours" },
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
] as const satisfies readonly { value: InviteExpiry; label: string }[];

/** Which invite sheet is open: change how long the link lasts, swap it for a new one, or turn it off. */
type InviteSheet = "expiry" | "reset" | "stop" | null;

/**
 * Who's in the group (§1). Everyone sees the names; the organizer also
 * sees phone numbers, manages the invite link (the only way in) and can
 * remove people. Members can leave. What each person can do comes from
 * the server (`memberRowActions`), not from this page.
 */
export default function GroupMembersPage() {
  const { slug } = useParams<{ slug: string }>();
  const { me, requireAuth, signInSheetProps } = useRequireAuth();
  const { data: group, isLoading } = trpc.groups.getBySlug.useQuery({ slug });
  const members = trpc.groups.members.useQuery({ slug }, { enabled: group?.access === "MEMBER" });

  const topBar = <TopBar backHref={`/g/${slug}`} title="Members" />;

  if (isLoading || members.isLoading) {
    return <ScreenSkeleton backHref={`/g/${slug}`} />;
  }

  if (!group || group.access !== "MEMBER" || !members.data) {
    return (
      <Screen topBar={topBar}>
        <EmptyState
          icon="lock"
          title="Members only"
          description={group ? `Ask ${group.organizerName} for the group’s invite link to join.` : "Check the link, or ask the organizer to send it again."}
          action={
            me ? undefined : (
              <Button variant="secondary" onClick={() => requireAuth(() => {})}>
                Already a member? Sign in
              </Button>
            )
          }
        />
        <SignInSheet {...signInSheetProps} />
      </Screen>
    );
  }

  return (
    <Screen topBar={topBar}>
      {group.isOrganizer && <InviteLinkSection group={group} />}
      <MemberList group={group} members={members.data.members} />
    </Screen>
  );
}

function InviteLinkSection({ group }: { group: MemberGroup }) {
  const origin = useOrigin();
  const utils = trpc.useUtils();
  const toast = useToast();
  const [sheet, setSheet] = useState<InviteSheet>(null);
  const [expiry, setExpiry] = useState<InviteExpiry>("never");
  const [shareOpen, setShareOpen] = useState(false);

  const close = () => setSheet(null);
  const refresh = () => utils.groups.getBySlug.invalidate({ slug: group.slug });
  const updateInvite = trpc.groups.updateInvite.useMutation({
    onSuccess: async (_, input) => {
      await refresh();
      close();
      toast({ message: input.reset ? "New invite link ready. The old one no longer works." : "Invite link updated" });
    },
  });
  const stopInvite = trpc.groups.stopInvite.useMutation({
    onSuccess: async () => {
      await refresh();
      close();
      toast({ message: "Invites stopped" });
    },
  });

  const invite = group.invite;
  if (!invite) return null;

  const url = invite.token ? `${origin}/g/${group.slug}/join/${invite.token}` : null;
  const expiryPicker = (
    <SegmentedControl label="Link works for" value={expiry} onChange={setExpiry} options={EXPIRY_OPTIONS} />
  );

  function open(next: Exclude<InviteSheet, null>) {
    setExpiry("never");
    setSheet(next);
  }

  return (
    <section className="flex flex-col gap-3">
      <SectionHeader title="Invite link" />
      {invite.state === "OPEN" && url && (
        <>
          <p className="text-small text-text-secondary">
            Anyone with this link can join.{" "}
            {invite.expiresAt ? `It stops working ${formatDateTime(new Date(invite.expiresAt))}.` : "It doesn’t expire."}
          </p>
          <LinkField url={url} />
          <div className="flex flex-wrap gap-3">
            <Button leadingIcon="share" onClick={() => setShareOpen(true)}>
              Share
            </Button>
            <Button variant="secondary" onClick={() => open("expiry")}>
              Change expiry
            </Button>
            <Button variant="secondary" onClick={() => open("reset")}>
              New link
            </Button>
            <Button variant="ghost" onClick={() => setSheet("stop")}>
              Stop invites
            </Button>
          </div>
          <ShareSheet
            open={shareOpen}
            onClose={() => setShareOpen(false)}
            title="Invite people"
            url={url}
            message={`Join ${group.name} to see and RSVP for games.`}
            preview={<SharePreview title={group.name} details="Join to see and RSVP for games." />}
          />
        </>
      )}
      {invite.state === "EXPIRED" && (
        <>
          <Banner tone="warning" title="The invite link has expired">
            Nobody new can join until you open it again.
          </Banner>
          <div className="flex flex-wrap gap-3">
            <Button onClick={() => open("expiry")}>Open it again</Button>
            <Button variant="secondary" onClick={() => open("reset")}>
              New link
            </Button>
          </div>
        </>
      )}
      {invite.state === "STOPPED" && (
        <>
          <p className="text-small text-text-secondary">Invites are off. Nobody new can join.</p>
          <div>
            <Button onClick={() => open("reset")}>Turn invites on</Button>
          </div>
        </>
      )}

      <ConfirmSheet
        open={sheet === "expiry"}
        onClose={close}
        title="How long should the link work?"
        confirmLabel="Save"
        onConfirm={() => updateInvite.mutate({ groupId: group.id, expiry, reset: false })}
        pending={updateInvite.isPending}
        error={updateInvite.error?.message}
      >
        {expiryPicker}
        <p className="text-small text-text-secondary">The link stays the same, so anyone who has it can still use it until then.</p>
      </ConfirmSheet>

      <ConfirmSheet
        open={sheet === "reset"}
        onClose={close}
        title={invite.state === "STOPPED" ? "Turn invites on?" : "Make a new invite link?"}
        banner={
          invite.state === "STOPPED"
            ? undefined
            : { tone: "warning", title: "The current link stops working", body: "Anyone you sent it to who hasn’t joined yet will need the new one." }
        }
        confirmLabel={invite.state === "STOPPED" ? "Turn on" : "Make new link"}
        onConfirm={() => updateInvite.mutate({ groupId: group.id, expiry, reset: true })}
        pending={updateInvite.isPending}
        error={updateInvite.error?.message}
      >
        {expiryPicker}
      </ConfirmSheet>

      <ConfirmSheet
        open={sheet === "stop"}
        onClose={close}
        title="Stop invites?"
        banner={{ tone: "warning", title: "The link stops working", body: "Members stay in the group. You can turn invites back on with a new link." }}
        tone="destructive"
        confirmLabel="Stop invites"
        cancelLabel="Keep the link"
        onConfirm={() => stopInvite.mutate({ groupId: group.id })}
        pending={stopInvite.isPending}
        error={stopInvite.error?.message}
      />
    </section>
  );
}

function MemberList({ group, members }: { group: MemberGroup; members: readonly Member[] }) {
  const router = useRouter();
  const utils = trpc.useUtils();
  const toast = useToast();
  const [removing, setRemoving] = useState<Member | null>(null);
  const [leaving, setLeaving] = useState(false);

  const removeMember = trpc.groups.removeMember.useMutation({
    onSuccess: async () => {
      await utils.groups.invalidate();
      toast({ message: `${removing?.name ?? "They"} removed from the group` });
      setRemoving(null);
    },
  });
  const leave = trpc.groups.leave.useMutation({
    onSuccess: async () => {
      await utils.groups.invalidate();
      toast({ message: `You left ${group.name}` });
      router.push("/");
    },
  });

  // Organizers see phone numbers (to chase payments); members just see who's in.
  function detail(member: Member): string {
    if (member.isOrganizer) return "Organizer";
    return member.phoneNumber ?? "Member";
  }

  return (
    <section className="flex flex-col gap-3">
      <SectionHeader title={`Members · ${members.length}`} />
      <div className="rounded-lg border border-border-default bg-bg-surface">
        {members.map((member) => (
          <PersonManageRow
            key={member.userId}
            name={member.name}
            detail={detail(member)}
            items={member.actions.map((action) => ({
              REMOVE: { label: "Remove from group", tone: "danger" as const, onSelect: () => setRemoving(member) },
            })[action])}
          />
        ))}
      </div>

      {group.canLeave && (
        <div>
          <Button variant="ghost" onClick={() => setLeaving(true)}>
            Leave group
          </Button>
        </div>
      )}

      <ConfirmSheet
        open={removing !== null}
        onClose={() => setRemoving(null)}
        title={`Remove ${removing?.name ?? ""}?`}
        banner={{
          tone: "warning",
          title: "They stop seeing this group and its new games",
          body: "Games they’re already in don’t change. They can rejoin with the invite link, so make a new link if you want to stop that.",
        }}
        tone="destructive"
        confirmLabel={`Remove ${removing?.name ?? ""}`}
        cancelLabel="Keep them"
        onConfirm={() => removing && removeMember.mutate({ groupId: group.id, memberUserId: removing.userId })}
        pending={removeMember.isPending}
        error={removeMember.error?.message}
      />

      <ConfirmSheet
        open={leaving}
        onClose={() => setLeaving(false)}
        title={`Leave ${group.name}?`}
        banner={{
          tone: "warning",
          title: "You stop seeing this group and its new games",
          body: "Games you’re already in don’t change. To come back you’ll need the invite link again.",
        }}
        tone="destructive"
        confirmLabel="Leave group"
        cancelLabel="Stay"
        onConfirm={() => leave.mutate({ groupId: group.id })}
        pending={leave.isPending}
        error={leave.error?.message}
      />
    </section>
  );
}
