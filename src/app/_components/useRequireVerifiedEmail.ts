"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc/client";

/**
 * Organizer actions need a verified email. Wrap one in `requireEmail`: if the
 * account has none yet, the verify sheet opens and the action resumes once it's
 * verified. Assumes the person is signed in (call it inside `requireAuth`).
 *
 *     const { requireEmail, verifyEmailSheetProps } = useRequireVerifiedEmail();
 *     <VerifyEmailSheet {...verifyEmailSheetProps} />
 */
export function useRequireVerifiedEmail() {
  const utils = trpc.useUtils();
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);

  async function requireEmail(action: () => void) {
    // Ask fresh, not from a possibly stale cache: they may have just verified in another tab.
    const account = await utils.auth.account.fetch();

    if (account.emailVerified) {
      action();
    } else {
      setPendingAction(() => action);
    }
  }

  return {
    requireEmail,
    verifyEmailSheetProps: {
      open: pendingAction !== null,
      onClose: () => setPendingAction(null),
      onVerified: () => {
        pendingAction?.();
        setPendingAction(null);
      },
    },
  };
}
