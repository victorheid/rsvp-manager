"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc/client";

/**
 * UI spec §3: "Defer sign-in until it's needed." Wrap an action in
 * `requireAuth`; if signed out, the sign-in flow renders (caller reads
 * `isSigningIn`) and the action resumes automatically once it succeeds.
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
    isSigningIn: pendingAction !== null,
    requireAuth,
    handleSignedIn,
    cancelSignIn: () => setPendingAction(null),
  };
}
