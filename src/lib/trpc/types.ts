import type { inferRouterInputs, inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@/server/router";

/**
 * Derived, never hand-written. Use these instead of redeclaring a
 * procedure's input/output shape:
 *   type Event = RouterOutputs["events"]["getBySlug"];
 */
export type RouterInputs = inferRouterInputs<AppRouter>;
export type RouterOutputs = inferRouterOutputs<AppRouter>;
