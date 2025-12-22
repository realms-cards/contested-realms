-- Add open seat registration support
CREATE TYPE "SeatStatus" AS ENUM ('active', 'vacant');

ALTER TABLE "TournamentRegistration"
ADD COLUMN "seatStatus" "SeatStatus" NOT NULL DEFAULT 'active',
ADD COLUMN "seatMeta" JSONB;
