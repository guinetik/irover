# Martian site persistence (localStorage)

The Mars site stores lightweight progress keys in the browser so reloads do not reset mission time or replay achievement toasts.

| Key | Purpose |
|-----|---------|
| `mars-site-sol-v1` | JSON object mapping `siteId` → mission sol (integer ≥ 1). |
| `mars-achievements-unlocked-v1` | JSON array of unlocked achievement id strings (same ids as `public/data/achievements.json`). |
| `mars-reward-track-v1` | JSON `{ unlockedTrackIds, prevSP }` — id list for reward-track rows and the last SP cursor used so milestone banners do not fire again on load. |

Science points (`mars-lifetime-sp`) and other systems were already persisted separately.
