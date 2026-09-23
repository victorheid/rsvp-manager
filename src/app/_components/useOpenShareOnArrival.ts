"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/**
 * After creating a group or a game we land on its page with `?share=1` so
 * the share sheet is already open (UI spec §10.1, §10.3). This reads that
 * flag once, removes it from the URL (so a refresh doesn't reopen it) and
 * returns the sheet's open state.
 */
export function useOpenShareOnArrival() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [open, setOpen] = useState(params.get("share") === "1");

  const cleaned = useRef(false);
  useEffect(() => {
    if (cleaned.current || params.get("share") !== "1") return;
    cleaned.current = true;
    router.replace(pathname);
  }, [params, pathname, router]);

  return { shareOpen: open, setShareOpen: setOpen };
}
