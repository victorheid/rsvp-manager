/**
 * Business rules for organizer payouts (spec §5). Pure functions only: no
 * Prisma calls, no Date.now(), no I/O.
 */

/** §5: a return path inside our own app — never an address someone else chose. */
export function isSafeReturnPath(path: string): boolean {
  return path.startsWith("/") && !path.startsWith("//") && !path.includes("\\");
}
