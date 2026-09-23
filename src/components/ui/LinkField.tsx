"use client";

import { useState } from "react";

/**
 * A read-only link with a Copy button that confirms ("Copied") for two
 * seconds. Shown in the share sheet and after a group or game is created.
 * Displays the URL without its protocol; copies the full URL.
 */
export interface LinkFieldProps {
  url: string;
}

export function LinkField({ url }: LinkFieldProps) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard can be blocked (in-app browsers, insecure context). The
      // link stays visible and selectable, so the user can copy it by hand.
    }
  }

  return (
    <div className="flex items-center gap-2 rounded-md bg-bg-subtle py-1 pl-4 pr-1">
      <span className="min-w-0 flex-1 select-all truncate text-small text-text-primary">
        {url.replace(/^https?:\/\//, "")}
      </span>
      <button
        type="button"
        onClick={() => void copy()}
        className="h-11 shrink-0 rounded-full px-4 text-button text-text-link hover:bg-accent-subtle"
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}
