import { randomBytes } from "node:crypto";
import { TRPCError } from "@trpc/server";
import type { Db } from "@/server/db";
import { inviteExpiresAt, type InviteExpiryChoice } from "@/server/domains/groups/rules";

/** The secret part of an invite link: short enough to share, too long to guess. */
export function newInviteToken(): string {
  return randomBytes(12).toString("base64url");
}

export interface UpdateInviteLinkInput {
  groupId: string;
  organizerId: string;
  expiry: InviteExpiryChoice;
  /** A new link: whoever has the old one can no longer join. */
  reset: boolean;
}

/**
 * Sets how long the group's invite link stays open, and optionally swaps
 * it for a new one (§1). Also turns invites back on after they were
 * stopped. Organizer only.
 */
export async function updateInviteLink(db: Db, input: UpdateInviteLinkInput, now: Date) {
  const group = await db.group.findUnique({
    where: { id: input.groupId },
    select: { organizerId: true, inviteToken: true },
  });

  if (!group) {
    throw new TRPCError({ code: "NOT_FOUND" });
  }

  if (group.organizerId !== input.organizerId) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Only the group's organizer can change its invite link." });
  }

  const inviteToken = input.reset || group.inviteToken === null ? newInviteToken() : group.inviteToken;

  await db.group.update({
    where: { id: input.groupId },
    data: { inviteToken, inviteExpiresAt: inviteExpiresAt(input.expiry, now) },
  });
}
