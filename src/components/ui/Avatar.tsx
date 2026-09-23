import { cn } from "./cn";

/**
 * Initials in a soft accent circle. Used for groups and people where an
 * image would be overkill (there are no profile photos). The initials are
 * decoration — the name is always shown next to it — so it's hidden from
 * screen readers.
 */
export interface AvatarProps {
  /** Any name; the first letter of the first two words is used. */
  name: string;
  size?: "md" | "lg";
  className?: string;
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join("");
}

export function Avatar({ name, size = "md", className }: AvatarProps) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid shrink-0 place-items-center rounded-full bg-accent-subtle text-accent-subtle-text",
        size === "md" ? "size-9 text-small-strong" : "size-12 text-body-strong",
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}
