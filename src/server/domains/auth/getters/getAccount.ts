import type { Db } from "@/server/db";

/** The signed-in user's own account details, for /me and for gating organizer actions in the UI. */
export async function getAccount(db: Db, userId: string) {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });

  return {
    phoneNumber: user.phoneNumber,
    firstName: user.firstName,
    email: user.email,
    emailVerified: user.emailVerifiedAt !== null,
  };
}
