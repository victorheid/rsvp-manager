import { TRPCError } from "@trpc/server";
import { isWalletEnabled } from "@/server/domains/wallet/rules";

/** Guards everything that starts using the wallet: top-ups, wallet RSVPs, wallet auto-join. */
export function assertWalletEnabled() {
  if (!isWalletEnabled(process.env)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "The wallet isn't available yet." });
  }
}
