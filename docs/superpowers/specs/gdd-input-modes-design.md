# Input modes and key bindings (GDD alignment)

**Date:** 2026-03-22

## Problem

[GDD v0.4](../../../inspo/mars-rovers-gdd-v03.md) assigns **[Tab]** to **UI mode** (mouse free, HUD clickable). The APXS inventory spec originally used **[Tab]** to toggle the inventory panel. One physical key cannot mean both without mode stacking rules that confuse players.

## Resolution (authoritative)

| Mode / action | Key | Notes |
|---------------|-----|--------|
| **Inventory panel** | **`I`** | Toggle open/close. `preventDefault()` on `keydown` when handling. |
| **UI mode** (future) | **`Tab`** | Reserved for GDD “UI MODE” when a clickable HUD shell exists. |
| **Rover mode** | Default | Pointer lock / canvas focus as today. |
| **Instrument overlay** | **`1`–`5`**, **`Esc`** | Unchanged from toolbar spec. |
| **APXS active** | **`Esc`** | Back to instrument overlay; second **`Esc`** to driving. |

## Implementation status

- Inventory uses **`I`** in [MartianSiteView.vue](../../../src/views/MartianSiteView.vue).
- **`Tab`** remains unassigned for UI mode until `GameHUD` / clickable power panel ships.

## Related documents

- [2026-03-22-apxs-gameplay-inventory-design.md](./2026-03-22-apxs-gameplay-inventory-design.md) — updated to match this binding table.
- [docs/plans/gdd/2026-03-22-priority-roadmap.md](../../plans/gdd/2026-03-22-priority-roadmap.md) — Tier 0 input binding item.
