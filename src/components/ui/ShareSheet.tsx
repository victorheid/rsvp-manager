"use client";

import { useSyncExternalStore, type ReactNode } from "react";
import { BottomSheet } from "./BottomSheet";
import { Button } from "./Button";
import { LinkField } from "./LinkField";

/**
 * "Send people to this": a link, a WhatsApp button (where most groups
 * live, UI spec §1) and the device's native share sheet when it has one.
 *
 * `preview` shows what people will see in the chat, so the organizer knows
 * what they're about to send. It's the same for a game and a group — only
 * the copy differs.
 */
export interface ShareSheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  /** The absolute link to share. */
  url: string;
  /** The message text that goes with the link. */
  message: string;
  /** Optional preview of the message. */
  preview?: ReactNode;
}

const subscribeNever = () => () => {};
const canShareNatively = () => typeof navigator !== "undefined" && typeof navigator.share === "function";

export function ShareSheet({ open, onClose, title, url, message, preview }: ShareSheetProps) {
  // Server render and hydration assume "no native share"; the client then
  // reveals the button. useSyncExternalStore does that without an effect.
  const nativeShare = useSyncExternalStore(subscribeNever, canShareNatively, () => false);
  const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(`${message}\n${url}`)}`;

  async function shareNatively() {
    try {
      await navigator.share({ title, text: message, url });
    } catch {
      // The user dismissed the native sheet — nothing to do.
    }
  }

  return (
    <BottomSheet open={open} onClose={onClose} title={title}>
      {preview}
      <LinkField url={url} />
      <div className="flex flex-col gap-3">
        <Button size="lg" fullWidth href={whatsappUrl} target="_blank" rel="noopener noreferrer">
          Share to WhatsApp
        </Button>
        {nativeShare && (
          <Button size="lg" fullWidth variant="secondary" onClick={() => void shareNatively()}>
            More options…
          </Button>
        )}
      </div>
    </BottomSheet>
  );
}

/**
 * The "what people will see" card shown at the top of a share sheet — the
 * title, when/where, and a one-line status ("8 in · 4 spots left · €8.00
 * each"). Pass it as `ShareSheet`'s `preview`.
 */
export interface SharePreviewProps {
  title: string;
  /** Secondary line, e.g. "Thu 25 Sep · 19:00 · Westside Sports Hall". */
  details?: string;
  /** Emphasised last line, e.g. the live headcount and price. */
  summary?: string;
}

export function SharePreview({ title, details, summary }: SharePreviewProps) {
  return (
    <div className="flex flex-col gap-1 rounded-lg bg-accent-subtle p-4">
      <p className="text-caption text-accent-subtle-text">WHAT PLAYERS SEE IN THE CHAT</p>
      <p className="text-body-strong text-text-primary">{title}</p>
      {details && <p className="text-small text-text-secondary">{details}</p>}
      {summary && <p className="text-small-strong text-text-primary">{summary}</p>}
    </div>
  );
}
