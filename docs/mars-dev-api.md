# MarsDev console API (development only)

`window.MarsDev` is installed when running the Vite dev server (`npm run dev`). It is not present in production builds.

## `MarsDev.mission(index)`

- **Purpose:** Reset saved mission progress, **auto-complete** every mission at catalog indices `0..index-1` (same SP and item rewards as normal completion, plus instrument unlocks from those missions), **keep existing LGA mailbox messages**, then **append** an incoming transmission for the mission at `index` (same shape as the initial briefing delivery).
- **Index:** 0-based, matching the `missions` array order in `public/data/missions.json` (not necessarily the same as the in-fiction mission numbering in names).
- **Storage cleared:** `mars-missions-v1` only (mailbox is **not** wiped).
- **Also cleared:** In-memory mission transmit state, objective tracker flags (RTG/REMS/repair, etc.), and active mission cooldown timers (`missionCooldowns.clearAll()`).
- **Returns:** `{ ok: true, missionId, name, priorCompletedIds }` or `{ ok: false, message }`.

Calling `mission(0)` clears mission progress and only adds the briefing for the first catalog entry (no prior completions). Calling `mission(5)` completes missions 0–4 in catalog order, then queues the briefing for mission 5.

**Note:** Lifetime SP is cumulative; repeated `mission(n)` calls in one session may stack SP from auto-completed missions again after each reset. Reload the page if you need a clean SP baseline.

After calling, open the LGA and accept the new mission as in normal play.

## Other helpers

- **`MarsDev.inventory.spawnRandom` / `spawnById`** — dev inventory spawning.
- **`MarsDev.science.addSP`** — grant science points without profile scaling.
