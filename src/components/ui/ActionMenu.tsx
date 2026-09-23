"use client";

import Link from "next/link";
import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "./cn";

/**
 * A ••• menu. The trigger is whatever you pass as children — a bare ••• icon
 * button, or a whole list row (the manage screen makes each person's row
 * the trigger, so tapping anywhere on it opens the menu).
 *
 * Each item is a verb, with an optional second line for the actions that
 * need explaining ("Records €8.00 received in cash. No money moves in the
 * app."). Put the most likely action first and mark it `tone: "primary"`
 * (bold); irreversible ones go last as `tone: "danger"`. Hide items that
 * make no sense right now rather than disabling them.
 *
 * The menu opens below the trigger, or above it when it wouldn't fit
 * below and there's more room above (a row near the bottom of the screen).
 *
 * Keyboard: Enter/Space opens and focuses the first item, ↑/↓ move, Esc
 * closes and returns focus. No hover-only behaviour (UI spec §12).
 */
export interface ActionMenuItem {
  label: string;
  /** Second line explaining what it does. Use it for anything with side effects. */
  description?: string;
  tone?: "default" | "primary" | "danger";
  /** Run when chosen. */
  onSelect?: () => void;
  /** Or navigate. `external` opens in a new tab. */
  href?: string;
  external?: boolean;
}

export interface ActionMenuProps {
  /** Accessible name of the trigger, e.g. "Actions for Aoife M.". */
  label: string;
  items: readonly ActionMenuItem[];
  /** Trigger content. */
  children: ReactNode;
  triggerClassName?: string;
  /** Which edge of the trigger the menu lines up with. Default `end`. */
  align?: "start" | "end";
  /** Classes for the outer wrapper (which is `position: relative`). */
  className?: string;
}

const ITEM_CLASS = "flex w-full flex-col items-start px-4 py-2.5 text-left hover:bg-bg-subtle focus:bg-bg-subtle focus:outline-none";

export function ActionMenu({ label, items, children, triggerClassName, align = "end", className }: ActionMenuProps) {
  const [open, setOpen] = useState(false);
  const [flipUp, setFlipUp] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  useLayoutEffect(() => {
    const root = rootRef.current;
    const menu = menuRef.current;
    if (!open || !root || !menu) return;

    const trigger = root.getBoundingClientRect();
    const menuHeight = menu.offsetHeight;
    const roomBelow = window.innerHeight - trigger.bottom;
    setFlipUp(menuHeight + 4 > roomBelow && trigger.top > roomBelow);
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const first = rootRef.current?.querySelector<HTMLElement>('[role="menuitem"]');
    first?.focus();

    function onPointerDown(event: MouseEvent) {
      if (rootRef.current && event.target instanceof Node && !rootRef.current.contains(event.target)) {
        setOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  function moveFocus(direction: 1 | -1) {
    const entries = Array.from(rootRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
    const index = entries.findIndex((entry) => entry === document.activeElement);
    const next = entries[(index + direction + entries.length) % entries.length];
    next?.focus();
  }

  function itemContent(item: ActionMenuItem): ReactNode {
    return (
      <>
        <span className={cn(item.tone === "danger" ? "text-danger-fg" : "text-text-primary", item.tone === "primary" ? "text-body-strong" : "text-body")}>
          {item.label}
        </span>
        {item.description && <span className="text-small text-text-secondary">{item.description}</span>}
      </>
    );
  }

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <button
        ref={triggerRef}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((current) => !current)}
        className={triggerClassName}
      >
        {children}
      </button>
      {open && (
        <div
          id={menuId}
          ref={menuRef}
          role="menu"
          aria-label={label}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              moveFocus(1);
            }
            if (event.key === "ArrowUp") {
              event.preventDefault();
              moveFocus(-1);
            }
          }}
          className={cn(
            "absolute z-30 w-[min(20rem,calc(100vw-2rem))] overflow-hidden rounded-md border border-border-default bg-bg-surface py-1 shadow-lg",
            flipUp ? "bottom-full mb-1" : "top-full mt-1",
            align === "end" ? "right-0" : "left-0",
          )}
        >
          {items.map((item) =>
            item.href !== undefined ? (
              <Link
                key={item.label}
                role="menuitem"
                href={item.href}
                target={item.external ? "_blank" : undefined}
                rel={item.external ? "noopener noreferrer" : undefined}
                onClick={() => setOpen(false)}
                className={ITEM_CLASS}
              >
                {itemContent(item)}
              </Link>
            ) : (
              <button
                key={item.label}
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  item.onSelect?.();
                }}
                className={ITEM_CLASS}
              >
                {itemContent(item)}
              </button>
            ),
          )}
        </div>
      )}
    </div>
  );
}
