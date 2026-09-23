import type { ChipTone } from "@/components/ui";
import { EVENT_PHASES, eventPhase, type EventPhase } from "@/server/domains/events/rules";

/**
 * How an event's phase is worded and coloured everywhere it appears (UI
 * spec §11). Players never see "Expired": it's "Didn't go ahead". The
 * phase itself comes from the events domain (`eventPhase`); this is only
 * its label.
 */
const PHASE_CHIPS: Record<EventPhase, { label: string; tone: ChipTone }> = {
  OPEN: { label: "Open", tone: "accent" },
  CONFIRMED: { label: "Game on", tone: "success" },
  LIVE: { label: "In progress", tone: "info" },
  FINISHED: { label: "Finished", tone: "neutral" },
  CANCELLED: { label: "Cancelled", tone: "danger" },
  EXPIRED: { label: "Didn’t go ahead", tone: "neutral" },
};

export function phaseChip(phase: EventPhase): { label: string; tone: ChipTone } {
  return PHASE_CHIPS[phase];
}

/** The chip for an event as of `now`. */
export function eventChip(
  event: Parameters<typeof eventPhase>[0],
  now: Date,
): { label: string; tone: ChipTone } {
  return phaseChip(eventPhase(event, now));
}

export { EVENT_PHASES };
