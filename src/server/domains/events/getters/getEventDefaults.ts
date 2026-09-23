import { TRPCError } from "@trpc/server";
import type { Db } from "@/server/db";
import { suggestEventDefaults } from "@/server/domains/events/rules";

export interface GetEventDefaultsInput {
  groupId: string;
  organizerId: string;
  startsAt: Date;
}

/**
 * UI spec §10.3: what the create-event form pre-fills once the organizer
 * has picked a date — everything copied from the group's most recent game
 * and re-anchored to the new date. Organizer only.
 */
export async function getEventDefaults(db: Db, input: GetEventDefaultsInput) {
  const group = await db.group.findUnique({
    where: { id: input.groupId },
    select: { name: true, organizerId: true, organizer: { select: { payoutsEnabled: true } } },
  });

  if (!group) {
    throw new TRPCError({ code: "NOT_FOUND" });
  }

  if (group.organizerId !== input.organizerId) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Only the group's organizer can create events here." });
  }

  const lastEvent = await db.event.findFirst({
    where: { groupId: input.groupId },
    orderBy: { startsAt: "desc" },
  });

  const suggestion = suggestEventDefaults({ groupName: group.name, lastEvent }, input.startsAt);

  // A copied "online" setting only carries over while the organizer can still take online payments.
  return { ...suggestion, onlineAllowed: suggestion.onlineAllowed && group.organizer.payoutsEnabled };
}
