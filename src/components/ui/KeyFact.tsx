import type { ReactNode } from "react";
import { Icon, type IconName } from "./Icon";

/**
 * One fact about a game, icon first: when, where. Give it a `href` to make
 * the whole row a link (the location opens the maps app).
 */
export interface KeyFactProps {
  icon: IconName;
  primary: string;
  secondary?: ReactNode;
  href?: string;
}

export function KeyFact({ icon, primary, secondary, href }: KeyFactProps) {
  const content = (
    <>
      <span className="grid size-10 shrink-0 place-items-center rounded-md bg-accent-subtle text-accent-subtle-text">
        <Icon name={icon} size={20} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-body-strong text-text-primary">{primary}</span>
        {secondary && <span className="block text-small text-text-secondary">{secondary}</span>}
      </span>
    </>
  );

  return href ? (
    <a href={href} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3">
      {content}
    </a>
  ) : (
    <div className="flex items-center gap-3">{content}</div>
  );
}
