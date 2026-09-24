/**
 * Business rules for groups (spec §1). Pure functions only.
 */

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function isValidSlug(slug: string): boolean {
  return slug.length >= 3 && slug.length <= 64 && SLUG_PATTERN.test(slug);
}

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// --- Invite links (§1) ---------------------------------------------------

/** How long a new or updated invite link stays open. */
export const INVITE_EXPIRY_CHOICES = ["never", "24h", "7d", "30d"] as const;
export type InviteExpiryChoice = (typeof INVITE_EXPIRY_CHOICES)[number];

const HOUR_MS = 60 * 60 * 1000;
const EXPIRY_MS: Record<Exclude<InviteExpiryChoice, "never">, number> = {
  "24h": 24 * HOUR_MS,
  "7d": 7 * 24 * HOUR_MS,
  "30d": 30 * 24 * HOUR_MS,
};

/** When a link set up at `now` with this choice stops working. Null: never. */
export function inviteExpiresAt(choice: InviteExpiryChoice, now: Date): Date | null {
  return choice === "never" ? null : new Date(now.getTime() + EXPIRY_MS[choice]);
}

type InviteFields = { inviteToken: string | null; inviteExpiresAt: Date | null };

/** The group's invite link as the organizer sees it. */
export type InviteState = "OPEN" | "EXPIRED" | "STOPPED";

export function inviteState(group: InviteFields, now: Date): InviteState {
  if (group.inviteToken === null) return "STOPPED";
  if (group.inviteExpiresAt !== null && group.inviteExpiresAt <= now) return "EXPIRED";
  return "OPEN";
}

/**
 * Whether a link someone opened still lets them join. A reset or stopped
 * link reads as INVALID (the token no longer matches); an expired one as
 * EXPIRED, so the page can say "ask for a new link".
 */
export type InviteLinkStatus = "VALID" | "EXPIRED" | "INVALID";

export function inviteLinkStatus(group: InviteFields, token: string, now: Date): InviteLinkStatus {
  if (group.inviteToken === null || group.inviteToken !== token) return "INVALID";
  return inviteState(group, now) === "EXPIRED" ? "EXPIRED" : "VALID";
}

// --- Members (§1) ----------------------------------------------------------

/** What the viewer can do to one person on the members list. */
export type MemberRowAction = "REMOVE";

/** Only the organizer removes people, and never themselves. */
export function memberRowActions(input: { viewerIsOrganizer: boolean; memberIsOrganizer: boolean }): MemberRowAction[] {
  return input.viewerIsOrganizer && !input.memberIsOrganizer ? ["REMOVE"] : [];
}

/** Members can leave; the organizer can't leave their own group. */
export function canLeaveGroup(input: { isMember: boolean; isOrganizer: boolean }): boolean {
  return input.isMember && !input.isOrganizer;
}
