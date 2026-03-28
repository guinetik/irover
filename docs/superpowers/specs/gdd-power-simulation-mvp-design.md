# Power simulation MVP — design

**Date:** 2026-03-22  
**GDD:** [inspo/mars-rovers-gdd-v03.md](../../../inspo/mars-rovers-gdd-v03.md)

## Purpose

Provide a single reactive **power budget** for the rover site so instruments, movement, and future thermal/heater systems share one model. Tier 1 of [epic-power-thermal](../../plans/gdd/epic-power-thermal.md).

## Player-facing meaning (scientific readout)

- **Wh / capacity** — Electrical **energy stored** on the rover bus (game-scale tank). Not chemistry-lab detail; enough to justify “why can’t I run everything at night forever.”
- **Generation (W)** — **RTG** = steady baseline from decay heat → electricity (damaged = lower W). **Solar** = insolation × panel peak, modulated by **time of sol** and **rover in sun vs shadow**.
- **Consumption (W)** — **Core** always on; **drive** when moving; **instruments** when active. Feeds Tier 2 **gating** on the toolbar.
- **Net (W)** — Charge vs drain; should match the **persistent HUD** ([gdd-hud-power-sol-clock-design.md](./gdd-hud-power-sol-clock-design.md), [tier1 battery plan](../plans/2026-03-22-tier1-battery-power-hud.md)).

## State (reactive)

| Field | Type | Notes |
|-------|------|--------|
| `batteryWh` | `ref<number>` | Current stored energy |
| `capacityWh` | `ref<number>` | Max storage; starts at GDD-ish 50 Wh until missions modify |
| `generationW` | `computed` or updated each tick | RTG + solar |
| `consumptionW` | updated each tick | Sum of active loads |
| `netW` | `generationW - consumptionW` | Positive charges battery |

## Generation

- **RTG:** constant baseline (e.g. **15 W** damaged, per GDD).
- **Solar:** peak power (e.g. **30 W** until upgrades) scaled by **daylight**:
  - Use `MarsSky.nightFactor` or equivalent: daylight fraction ≈ `(1 - nightFactor)`.
  - Optional **rover in sunlight** from `SiteScene.roverInSunlight`: when sun is up but rover in shadow, apply a factor (e.g. **0.25**) on solar only.

```text
solarW = solarPeakW * (1 - nightFactor) * (roverInSunlight ? 1 : sunShadowFactor)
generationW = rtgW + solarW
```

## Consumption (MVP table)

| Load | W | When |
|------|---|------|
| Core / avionics | 8 | Always |
| Drive motors | 5 | While rover is moving (`RoverController.isMoving`) |
| APXS | 6 | While laser drill is active (`APXSController` / drill `isDrilling`) |

Additional instruments and heater are added in later tiers.

## RTG modes (site)

- **Mission time** — Durations are **not** raw second literals in controllers. They come from `src/lib/missionTime.ts`: `SOL_DURATION` (one in-game sol in real seconds, from `MarsSky`) and `MARS_SOL_CLOCK_MINUTES`, exposed as `sceneSecondsFromSolFraction` / `sceneSecondsFromMarsClockHours` and `RTG_MISSION_DURATIONS` / `getRtgPhaseSceneSeconds()`. Vue callers can also use `useMarsGameClock()` which re-exports these helpers.
- **Cooldowns / timed windows** — `src/lib/missionCooldowns.ts` (`missionCooldowns.tick(sceneDelta)` with the same delta as power/physics). RTG overdrive chain and power shunt use `MISSION_COOLDOWN_ID.*` entries with optional `onComplete` chaining. Add new instruments’ lockouts here instead of ad-hoc `elapsed` fields.
- **Overdrive** — 2× drive speed, instrument lockout + recharge cycle; phase lengths = `getRtgPhaseSceneSeconds()`.
- **Power shunt** — **WASD off** while `RTG_POWER_SHUNT_EFFECT` runs, **battery filled on engage**, **×0.5** bus load via `tickPower({ powerLoadFactor })`, then `RTG_POWER_SHUNT_RECOVERY` before reuse.

## Sleep (critical power)

When SOC falls to **5%**, the rover enters **sleep** (see `MartianSiteView` overlay). Wake at **50%**.

While asleep, loads must not routinely exceed **RTG + solar** or the pack sits at **0%** forever. The model uses:

- **Hibernation core** — a small fixed bus draw (`SLEEP_HIBERNATION_CORE_W`, not full 8 W avionics).
- **Heater** — only a **fraction** of thermal heater watts is billed to the battery; the remainder is treated as covered by RTG waste heat so cold nights can still trickle-charge.

Thermal simulation (`useMarsThermal`) is unchanged; only the **electrical bus** accounting during sleep is reduced.

## Integration

- **Composable:** `useMarsPower()` in `src/composables/useMarsPower.ts` (singleton refs, like `useInventory`).
- **Tick:** `tickPower(deltaSeconds, inputs)` called from [MartianSiteView.vue](../../../src/views/MartianSiteView.vue) animation loop after `controller.update(delta)`.
- **Battery clamp:** `batteryWh` clamped to `[0, capacityWh]`.

## Time scaling

Wh integration uses an **economy scale** so a ~3-minute accelerated sol still produces visible battery change:

```text
dWh = netW * deltaSeconds * ECONOMY_SCALE
```

`ECONOMY_SCALE` is tuned empirically (order `1/120`–`1/60`) and documented in code; future work can tie it to `SOL_DURATION` in [MarsSky.ts](../../../src/three/MarsSky.ts).

## Instrument hooks

- APXS (or view) sets drilling flag into tick inputs, or power composable exposes `setApxsDrilling(boolean)` called from the animate loop when `controller.mode === 'active'` and APXS drill state is true.

## Out of scope (MVP)

- Yellow/red/blackout HUD behavior and per-slot **LOW / NO POWER** — **[Tier 2 plan](../plans/2026-03-22-tier2-instrument-power-gating.md)**.
- Dust storms, panel dust, mission-granted capacity/solar peaks.
- Persistence across sessions.

## Related

- [gdd-hud-power-sol-clock-design.md](./gdd-hud-power-sol-clock-design.md)
- [2026-03-22-tier2-instrument-power-gating.md](../plans/2026-03-22-tier2-instrument-power-gating.md)
