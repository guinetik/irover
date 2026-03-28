# Tier 1 — Battery, power simulation, persistent HUD (plan)

**Date:** 2026-03-22  
**Roadmap:** [2026-03-22-priority-roadmap.md](../../plans/gdd/2026-03-22-priority-roadmap.md) **Tier 1**  
**Design:** [gdd-power-simulation-mvp-design.md](../specs/gdd-power-simulation-mvp-design.md), [gdd-hud-power-sol-clock-design.md](../specs/gdd-hud-power-sol-clock-design.md)  
**Mockups:** [mars_rovers_hud_mockup.html](../../../mars_rovers_hud_mockup.html), [mars_rovers_day_night_hud.html](../../../mars_rovers_day_night_hud.html) — [index](../../plans/gdd/ui-reference-mockups.md)

## Intent

Close **Tier 1** as a **credible mission energy loop**: the player always sees **how much electrical energy is stored**, **whether the bus is charging or draining**, and **where they are in the sol** — without waiting for instrument overlays. Instrument UIs can keep **per-tool detail** (watts, eligibility); the **left stack** is the **persistent mission telemetry** slice.

**Status today:** **Simulation + HUD shell are integrated** — [`useMarsPower.ts`](../../../src/composables/useMarsPower.ts), [`PowerHud.vue`](../../../src/components/PowerHud.vue), wired in [`MartianSiteView.vue`](../../../src/views/MartianSiteView.vue) with `tickPower` each frame and **Sol / Mars clock** from `MarsSky.timeOfDay`. Remaining Tier 1 work is **polish, mockup parity, and scientific readout depth** (below), not greenfield implementation.

---

## Scientific value (what we’re teaching with numbers)

These are the **player-facing meanings** — copy and HUD labels should reinforce them; numbers stay game-tuned, not JPL-exact.

| Concept | Game representation | Why it matters |
|--------|---------------------|----------------|
| **Stored energy** | **Wh** (watt-hours) in `batteryWh` / `capacityWh` | Same unit as small battery packs and daily energy budgets. **Capacity** = “how big the tank is”; **state of charge** = fill bar + `x/y Wh`. |
| **Generation** | **RTG (W)** + **solar (W)** → `generationW` | **RTG** = slow, weatherless baseline (damaged rover = lower baseline). **Solar** = daylight and **geometry** (sun angle via `nightFactor`, **shadow** via `roverInSunlight`). Teaches *why* night and shade matter before **Tier 3** thermal. |
| **Load** | **Core + drive + active instruments** → `consumptionW` | **Science has a power cost**: avionics always on; driving adds motors; APXS drill adds sustained draw. Sets up Tier 2 **LOW / NO POWER** on tools. |
| **Net power** | `netW = generation − consumption` | **+W** = charging (green); **−W** = draining (red). The **single glance** answer to “can I afford this op?” |
| **Sol index** | `Sol n` incremented on sky wrap | **Mars operations cadence** — ties power HUD to **time** (when solar returns, when cooldowns end in later tiers). |
| **Mars clock** | `timeOfDay` → **24h37m** civil time | Reinforces **sol length** vs Earth; matches GDD “Mars Time” language. |

Optional one-line **tooltip or micro-caption** under Wh (Tier 1 polish): e.g. *“Bus energy — RTG + solar in, loads out.”* Keep it short; full instrument copy stays in overlays.

---

## As-built integration (reference)

| Piece | Role |
|-------|------|
| `useMarsPower()` | Singleton refs: `batteryWh`, `capacityWh`, `generationW`, `consumptionW`, `netW`; `tickPower(Δt, input)` with `nightFactor`, `roverInSunlight`, `moving`, `apxsDrilling`. |
| `MartianSiteView` animate loop | Calls `tickPower` after controller/APXS updates; maintains `marsSol` / `marsTimeOfDay` from `siteScene.sky`; passes props to `PowerHud`. |
| `PowerHud` | Fixed left column: PWR bar, `Wh / Wh`, signed `netW`, **Sol** + **HH:MM** (no “MT” label yet). Hidden only during descent/deploy overlay. |
| `MarsSky` | `SOL_DURATION` (accelerated sol), `timeOfDay`, `nightFactor` — economy scale in composable is separate; see **Tuning** below. |

---

## Definition of done — Tier 1 (revised)

| # | Item | Done when |
|---|------|-----------|
| 1.1 | **Power simulation MVP** | RTG + solar + loads integrate Wh each tick; clamp `[0, capacity]`; inputs match spec (night, shadow, move, APXS drill). **✅ Core done** — verify any new instruments register load when their **Tier 4** tool work lands. |
| 1.2 | **Persistent power HUD** | **Always visible** on site after deploy (not only inside an instrument). **Battery + net W** shipped; **GEN / USE** optional second line for mockup parity. **🟡 Polish** — styling vs [mars_rovers_hud_mockup.html](../../../mars_rovers_hud_mockup.html), optional icons, micro-copy. |
| 1.3 | **Sol clock** | Sol index + Mars-length clock from `timeOfDay`. **✅ Done** — add **“MT”** or **“Mars Time”** label if design wants parity with [gdd-hud-power-sol-clock-design.md](../specs/gdd-hud-power-sol-clock-design.md) § example. |

**Tier 1 exit:** Player can **read storage, charge/discharge, and sol time** from one persistent panel; numbers **match** `useMarsPower` (no duplicate sources of truth).

---

## Polish & integration backlog (ordered)

1. **Expose GEN / USE on HUD** — Pass `generationW` and `consumptionW` into `PowerHud` (or compact `↑45W ↓38W` pattern from mockup). Teaches *where* net comes from; still one panel.
2. **Label Mars time** — Append `MT` or small caps `MARS TIME` under clock per HUD spec.
3. **Mockup pass** — Spacing, optional **solar/RTG hint** (icon or `RTG+SOL` micro-label), divider treatment vs [mars_rovers_hud_mockup.html](../../../mars_rovers_hud_mockup.html).
4. **Tuning note in code** — Comment linking `ECONOMY_WH_PER_W_SEC` to `MarsSky` `SOL_DURATION` so a future change to sol length triggers a conscious retune of visible drain/charge rates.
5. **Instrument overlay vs HUD** — Keep **per-slot watts and gating copy** in `InstrumentOverlay` / toolbar (Tier 2); HUD stays **aggregate bus** only.

---

## Out of scope (Tier 2+)

- Yellow / red / blackout thresholds, **LOW / NO POWER** on slots — [Tier 2 instrument power plan](./2026-03-22-tier2-instrument-power-gating.md).
- Dust storms, mission-granted capacity/solar peaks — progression epic.
- Thermal row on same stack — **Tier 3** + [mars_thermal_hud_mockup.html](../../../mars_thermal_hud_mockup.html).

---

## Verification

- Run site scene: battery moves with day/night and driving/APXS; sol increments when sky wraps; HUD visible with rover ready.
- `npm run build` after HUD/props changes.
