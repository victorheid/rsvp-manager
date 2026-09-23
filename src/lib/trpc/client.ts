import { createTRPCReact } from "@trpc/react-query";
import type { AppRouter } from "@/server/router";

// The single source of client-side types: everything here is inferred
// from AppRouter, which is inferred from the Prisma-backed routers. Never
// hand-write a type that duplicates what this already gives you — use
// `RouterOutputs`/`RouterInputs` below.
export const trpc = createTRPCReact<AppRouter>();
