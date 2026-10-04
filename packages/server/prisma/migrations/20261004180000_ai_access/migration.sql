-- Stage 44d: a GM's request for the owner's AI (per account). The switch
-- „Udostępniam AI” and the lease are in-memory and never stored.
ALTER TABLE "User" ADD COLUMN "aiAccess" TEXT;
ALTER TABLE "User" ADD COLUMN "aiRequestedAt" DATETIME;
ALTER TABLE "User" ADD COLUMN "aiDecidedAt" DATETIME;
