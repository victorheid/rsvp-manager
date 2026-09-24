-- One free-text name instead of first name + last initial.
ALTER TABLE "User" ADD COLUMN "name" TEXT;
UPDATE "User" SET "name" = "firstName" || ' ' || "lastInitial" || '.';
ALTER TABLE "User" ALTER COLUMN "name" SET NOT NULL;
ALTER TABLE "User" DROP COLUMN "firstName", DROP COLUMN "lastInitial";

-- Invite links: existing groups get an open link that never expires.
ALTER TABLE "Group" ADD COLUMN "inviteToken" TEXT, ADD COLUMN "inviteExpiresAt" TIMESTAMP(3);
UPDATE "Group" SET "inviteToken" = md5(random()::text || "id");
CREATE UNIQUE INDEX "Group_inviteToken_key" ON "Group"("inviteToken");

-- Games are for group members unless the organizer opens them up.
ALTER TABLE "Event" ADD COLUMN "openToNonMembers" BOOLEAN NOT NULL DEFAULT false;
