-- League opt-outs: slugs of leagues (League.slug, or "soatc") a user has left.
-- An opted-out player shows no badge for that league and their matches are
-- never reported to it or flagged as league matches. Additive with a default.
ALTER TABLE "User" ADD COLUMN "leagueOptOuts" TEXT[] DEFAULT ARRAY[]::TEXT[];
