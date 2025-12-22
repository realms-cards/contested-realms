## Why
Automatic round progression makes live tournaments confusing when players disconnect or results need host intervention.
Hosts need explicit control to close rounds, resolve invalid matches, and start the next round on demand.

## What Changes
- Require hosts to end rounds manually once all matches are completed or invalidated.
- Allow hosts to mark a match invalid and optionally award a bye to the remaining player.
- After a round ends, generate the next round pairings in a pending state until the host starts it.
- Ending the final round triggers tournament completion and the victory screen.

## Impact
- Affected specs: tournament-management
- Affected code: tournament services (pairings, round advancement), match lifecycle, API routes, realtime broadcasts, and tournament UI controls.
- Data changes: may require storing match invalidation/bye metadata (use existing status/result if possible).
