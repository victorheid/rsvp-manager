import { z } from "zod";

/**
 * §2: an optional itemized breakdown of the total cost (e.g. "Court
 * booking – €80"). Display only — no logic reads it. Stored as a JSON
 * column, so both the write side (router input) and the read side
 * (getEventBySlug) parse it through this same schema, per CLAUDE.md:
 * "Everything from outside... JSON columns... gets parsed with Zod at the
 * boundary."
 */
export const costBreakdownSchema = z
  .array(
    z.object({
      label: z.string().min(1).max(120),
      amountCents: z.number().int().nonnegative(),
    }),
  )
  .max(20);

export type CostBreakdownItem = z.infer<typeof costBreakdownSchema>[number];
