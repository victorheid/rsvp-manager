import Link from "next/link";

/**
 * A heading for a section of a screen, with an optional link or button at
 * the end ("Show all 8", "Create a group"). Use it instead of a bare
 * `<h2>` so every section heading looks and aligns the same.
 */
export interface SectionHeaderProps {
  title: string;
  action?: { label: string; onClick: () => void } | { label: string; href: string };
}

export function SectionHeader({ title, action }: SectionHeaderProps) {
  const actionClass = "flex h-11 items-center px-2 text-small-strong text-text-link";
  return (
    <div className="flex items-center gap-2">
      <h2 className="flex-1 text-heading text-text-primary">{title}</h2>
      {action &&
        ("href" in action ? (
          <Link href={action.href} className={actionClass}>
            {action.label}
          </Link>
        ) : (
          <button type="button" onClick={action.onClick} className={actionClass}>
            {action.label}
          </button>
        ))}
    </div>
  );
}
