-- Guests (account-less players from invite links) get a shadow User row the
-- first time they enter a tournament, so the registration/standing/draft
-- foreign keys keep working. The flag keeps them out of user listings.
ALTER TABLE "User" ADD COLUMN "isGuest" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX "User_isGuest_idx" ON "User"("isGuest");

-- Shareable tournament invite: whoever holds the token may view and join the
-- tournament, private or not. Null until the host generates a link.
ALTER TABLE "Tournament" ADD COLUMN "inviteToken" TEXT;
CREATE UNIQUE INDEX "Tournament_inviteToken_key" ON "Tournament"("inviteToken");
