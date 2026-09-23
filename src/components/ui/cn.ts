/** Joins class names, skipping falsy parts: `cn("a", isOn && "b")`. */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}
