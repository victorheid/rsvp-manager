import { TRPCError } from "@trpc/server";
import type { Db } from "@/server/db";
import { EmailCodePurpose } from "@/generated/prisma/enums";
import { consumeEmailCode, issueEmailCode } from "@/server/domains/auth/actions/emailCodes";
import { normalizeEmail } from "@/server/domains/auth/rules";
import type { EmailSender } from "@/server/integrations/email";
import type { SmsSender } from "@/server/integrations/sms";

/**
 * First step of verifying an organizer's email: sends a code to the address
 * (§ decision: organizers need a verified email). An address already
 * verified by someone else is refused.
 */
export async function requestEmailVerification(
  db: Db,
  emailSender: EmailSender,
  input: { userId: string; email: string },
  now: Date,
) {
  const email = normalizeEmail(input.email);
  const owner = await db.user.findUnique({ where: { email } });

  if (owner && owner.id !== input.userId) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "That email is already used by another account." });
  }

  await issueEmailCode(
    db,
    emailSender,
    { userId: input.userId, purpose: EmailCodePurpose.VERIFY_EMAIL, email, subject: "Verify your email" },
    now,
  );
}

/**
 * Second step: the code proves the address, and it becomes the account's
 * verified email. Replacing an existing verified email tells the old address
 * and the phone, so a hijacked session can't quietly swap the recovery
 * channel.
 */
export async function verifyEmail(
  db: Db,
  senders: { email: EmailSender; sms: SmsSender },
  input: { userId: string; code: string },
  now: Date,
) {
  const { previous, current } = await db.$transaction(async (tx) => {
    const before = await tx.user.findUniqueOrThrow({ where: { id: input.userId } });
    const verification = await consumeEmailCode(tx, db, { userId: input.userId, purpose: EmailCodePurpose.VERIFY_EMAIL, code: input.code }, now);

    const taken = await tx.user.findUnique({ where: { email: verification.email } });
    if (taken && taken.id !== input.userId) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "That email is already used by another account." });
    }

    const after = await tx.user.update({
      where: { id: input.userId },
      data: { email: verification.email, emailVerifiedAt: now },
    });

    return { previous: before, current: after };
  });

  if (previous.email && previous.emailVerifiedAt && previous.email !== current.email) {
    await senders.email.send({
      to: previous.email,
      subject: "Your email was changed",
      body: `The email on your RSVP Manager account was changed to ${current.email}. If that wasn't you, contact support.`,
    });
    await senders.sms.send({ to: current.phoneNumber, body: `Your RSVP Manager email was changed to ${current.email}.` });
  }

  return { email: current.email };
}
