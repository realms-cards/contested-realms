## Round Lifecycle

### State Overview
- A round is **active** once started and remains active until the host ends it.
- A round is **ready to end** when all matches are completed or invalidated.
- The next round pairings are generated after host ends the current round and remain **pending** until the host starts them.

### Match Invalidations and Byes
- Hosts can end a match as **invalid** when a player disconnects or a result cannot be completed.
- If one player remains available, the host may award a **bye** (counts as a win for standings).
- Invalid matches count toward the "ready to end" condition without blocking the round.

### Final Round Completion
- The tournament completes only after the host ends the final round.
- Ending the final round triggers final standings + victory screen broadcast.

### Data Notes
- Prefer using existing match status/result fields; only add schema if required to store invalid/bye metadata.
