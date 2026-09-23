"use client";

import { useSyncExternalStore } from "react";

const subscribeNever = () => () => {};

/**
 * The site's origin (`https://example.com`) for building absolute share
 * links. Empty during server render and hydration, the real value after —
 * safe to use in a component that renders on the server.
 */
export function useOrigin(): string {
  return useSyncExternalStore(
    subscribeNever,
    () => window.location.origin,
    () => "",
  );
}
