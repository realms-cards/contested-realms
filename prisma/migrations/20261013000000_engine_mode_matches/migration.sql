-- Rules-engine matches: a second, parallel match pipeline alongside the legacy board.
--
-- `engineMode` is set by the lobby host when the match is created and never changes — the two
-- pipelines cannot be mixed, so the legacy action handler refuses a match that carries it.
--
-- `engineState` is deliberately NOT the existing `game` column. That one is deep-merged with
-- patches sent by clients and read by the spectator sanitiser, neither of which understands the
-- engine's shape; letting either touch an engine match would corrupt it for both players.
-- Both columns are additive with defaults, so existing rows and older server builds are
-- unaffected.

ALTER TABLE "OnlineMatchSession"
  ADD COLUMN "engineMode" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "engineState" JSONB;
