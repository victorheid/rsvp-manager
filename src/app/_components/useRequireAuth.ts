"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc/client";

/**
 * UI spec §3: "Defer sign-in until it's needed." Wrap an action in
 * `requireAuth`; if signed out, the sign-in sheet opens and the action
 * resumes automatically once it succeeds. Render the sheet once per page:
 *
 *     const { requireAuth, signInSheetProps } = useRequireAuth();
 *     …
 *     <SignInSheet {...signInSheetProps} />
 */
export function useRequireAuth() {
  const { data: me } = trpc.auth.me.useQuery();
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);

  function requireAuth(action: () => void) {
    if (me) {
      action();
    } else {
      setPendingAction(() => action);
    }
  }

  function handleSignedIn() {
    pendingAction?.();
    setPendingAction(null);
  }

  return {
    me,
    requireAuth,
    signInSheetProps: {
      open: pendingAction !== null,
      onClose: () => setPendingAction(null),
      onSuccess: handleSignedIn,
    },
  };
}
