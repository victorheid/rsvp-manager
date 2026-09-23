import type { ReactNode } from "react";
import { Icon, type IconName } from "./Icon";

/**
 * "Nothing here yet" with a reason and a way forward — never a dead end
 * (UI spec §1, principle 5). One sentence of why, one action.
 */
export interface EmptyStateProps {
  icon: IconName;
  title: string;
  description?: ReactNode;
  /** Usually a `Button`. */
  action?: ReactNode;
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-3 px-4 py-8 text-center">
      <span className="grid size-16 place-items-center rounded-full bg-accent-subtle text-accent-subtle-text">
        <Icon name={icon} size={28} />
      </span>
      <h2 className="text-heading text-text-primary">{title}</h2>
      {description && <p className="max-w-xs text-small text-text-secondary">{description}</p>}
      {action}
    </div>
  );
}
