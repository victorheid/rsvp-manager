"use client";

import { useEffect, useState } from "react";

/**
 * The current time, refreshed on an interval, for screens whose wording
 * depends on it (a game flips from "Game on" to "In progress" at its
 * start). Reading `new Date()` during render would be impure; this keeps
 * the clock in state so renders stay predictable.
 */
export function useNow(intervalMs = 30_000): Date {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);

  return now;
}
