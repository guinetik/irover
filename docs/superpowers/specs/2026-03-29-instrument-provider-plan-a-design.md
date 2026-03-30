# Instrument Provider — Plan A Design
**Date:** 2026-03-29
**Scope:** New data-driven instrument infrastructure + help dialog. Zero breakage of existing system.

---

## Goal

Move instrument configuration out of `InstrumentOverlay.vue` into a data file, build the factory/registry/tick-controller infrastructure that Plan B will wire into the live scene, and ship the instrument help dialog as the visible user-facing deliverable.

The old system (`createMarsSiteTickHandlers`, hardcoded `INSTRUMENTS` record) remains fully operational throughout Plan A. The new system is built and tested in parallel.

---

## Out of Scope (Plan B)

- Wiring `InstrumentTickController` into the animation loop
- Removing `createMarsSiteTickHandlers.ts`
- Replacing the hardcoded `INSTRUMENTS` record in `InstrumentOverlay.vue`
- Decomposing `MarsSiteViewController.ts` or `MartianSiteView.vue`

---

## 1. `public/data/instruments.json`

Single source of truth for all instrument static configuration. Keyed as an array — order determines nothing; `slot` is the canonical identifier.

### Schema

```ts
interface InstrumentHelpImage {
  src: string       // e.g. "/images/help/dan-panel.jpg" — player-sourced screenshot
  alt: string       // describes exactly what screenshot to capture
}

interface InstrumentHelpSection {
  heading: string   // e.g. "OPERATION", "WATCH FOR"
  body: string      // plain text, no HTML
}

interface InstrumentHelp {
  summary: string                   // one-line: what this instrument does in gameplay
  sections: InstrumentHelpSection[]
  images?: InstrumentHelpImage[]
}

interface InstrumentUpgradeDef {
  name: string
  desc: string
  req: string
}

interface InstrumentDef {
  id: string                // e.g. "dan", "chemcam", "rtg"
  slot: number              // matches existing slot keys (1–14)
  icon: string              // display glyph
  name: string
  type: string              // subtitle, e.g. "NEUTRON SCANNER"
  desc: string              // short description shown in overlay
  power: string             // display string, e.g. "10W"
  controllerType: string    // key into InstrumentRegistry controller map
  tickHandlerType: string   // key into InstrumentRegistry tick handler map
  upgrade: InstrumentUpgradeDef
  help: InstrumentHelp
}
```

### Help section headings (standard across all instruments)

Every instrument uses the same two sections. A third is optional:

| Heading | Content |
|---------|---------|
| `OPERATION` | Step-by-step how to use it — specific UI actions, keys |
| `WATCH FOR` | Costs, risks, mechanical gotchas specific to this instrument |
| `POWER BUDGET` | Only for instruments with significant or non-obvious power draw |

---

## 2. `src/instruments/InstrumentRegistry.ts`

Maps string keys from `instruments.json` to concrete TypeScript classes and factory functions. This is the only file that imports all instrument controllers.

```ts
// Controller registry: controllerType → class constructor
export const CONTROLLER_REGISTRY: Record<string, new () => InstrumentController>

// Tick handler registry: tickHandlerType → factory function
// Factory signature: (controller, ctx) => TickHandler
export const TICK_HANDLER_REGISTRY: Record<
  string,
  (controller: InstrumentController, ctx: MarsSiteContext) => TickHandler
>
```

**`MarsSiteContext`** is a new interface extracted here (or in a shared types file) that defines exactly what the factory and tick handlers need from the view — refs, callbacks, site params. This replaces the implicit dependency on the full `MarsSiteViewContext`.

---

## 3. `src/instruments/InstrumentFactory.ts`

```ts
export interface InstrumentTuple {
  def: InstrumentDef
  controller: InstrumentController
  tickHandler: TickHandler
}

export function createInstrumentTuple(
  def: InstrumentDef,
  ctx: MarsSiteContext,
): InstrumentTuple
```

Resolves `def.controllerType` and `def.tickHandlerType` from the registry, instantiates both, returns the tuple. Throws a clear error if either key is missing from the registry — fail fast during development.

---

## 4. `src/instruments/InstrumentTickController.ts`

Holds all tuples. Exposes a single `tick(delta)` for the animation loop (Plan B will call this).

```ts
export class InstrumentTickController {
  constructor(tuples: InstrumentTuple[])

  tick(delta: number): void          // forwards to every tickHandler
  getController(id: string): InstrumentController | undefined
  getController(slot: number): InstrumentController | undefined
  getDef(slot: number): InstrumentDef | undefined
  dispose(): void                    // disposes all controllers + handlers
}
```

Not wired into anything in Plan A. Instantiated by the provider; available for unit tests.

---

## 5. `src/composables/useInstrumentProvider.ts`

```ts
export function useInstrumentProvider() {
  // Loads instruments.json (static import — bundled, not fetched at runtime)
  // No factory, no tick controller, no context needed in Plan A

  return {
    defs: readonly InstrumentDef[],
    defBySlot: (slot: number) => InstrumentDef | undefined,
  }
}
```

**Singleton pattern**: module-level state, same pattern as `useMissions` and `useLGAMailbox`. First call loads the JSON; subsequent calls return the cached instance.

No `MarsSiteContext` required in Plan A. Factory and `InstrumentTickController` are built and tested as standalone units — the provider does not touch them until Plan B.

---

## 6. `src/components/InstrumentHelpDialog.vue`

Modal dialog. Receives a `help: InstrumentHelp` prop and an `instrumentName: string` prop.

### Layout

```
┌─────────────────────────────────────┐
│  [instrument name]  ·  FIELD REF    │  ← header, monospace, amber accent
├─────────────────────────────────────┤
│  [summary line]                     │  ← dim text, italic
│                                     │
│  OPERATION ─────────────────────    │  ← section heading, uppercase
│  [body text]                        │
│                                     │
│  WATCH FOR ─────────────────────    │
│  [body text]                        │
│                                     │
│  [image if present]                 │  ← full width, thin border
│  [caption / alt text]               │  ← dim, 10px
└─────────────────────────────────────┘
```

- Dark glass background, consistent with `MessageDialog.vue` palette
- Monospace font throughout (terminal aesthetic)
- Sections separated by a dim horizontal rule
- Images: `width: 100%`, `border: 1px solid rgba(196,149,106,0.2)`, `border-radius: 4px`
- No scrollbar unless content overflows (most instruments won't)
- Close button top-right; clicking backdrop also closes

### Props

```ts
defineProps<{
  help: InstrumentHelp | null
  instrumentName: string
  open: boolean
}>()
```

---

## 7. `InstrumentOverlay.vue` — minimal change only

**Add:** a `?` button in the `ov-header` row, top-right corner.
**Add:** local `helpOpen` ref, wired to show/hide `InstrumentHelpDialog`.
**Add:** call `useInstrumentProvider().defBySlot(activeSlot)` to get the `help` object.
**Change nothing else.** The hardcoded `INSTRUMENTS` record is not touched.

The button is only rendered if `defBySlot(activeSlot)?.help` exists — instruments without help content defined yet simply show no button.

---

## 8. Testing

New files get unit tests:

- **`InstrumentRegistry.test.ts`**: every key in `instruments.json` resolves to a valid entry in both registries
- **`InstrumentFactory.test.ts`**: factory returns a well-formed tuple; unknown keys throw
- **`InstrumentTickController.test.ts`**: `tick()` forwards to all handlers; `getController()` resolves by id and slot; `dispose()` calls through
- **`instrumentsData.test.ts`**: every entry in `instruments.json` has required fields; every `help` has at least one section; `controllerType` and `tickHandlerType` are non-empty strings

Existing tests are not modified.

---

## File Checklist

| File | Action |
|------|--------|
| `public/data/instruments.json` | Create |
| `src/instruments/InstrumentRegistry.ts` | Create |
| `src/instruments/InstrumentFactory.ts` | Create |
| `src/instruments/InstrumentTickController.ts` | Create |
| `src/composables/useInstrumentProvider.ts` | Create |
| `src/components/InstrumentHelpDialog.vue` | Create |
| `src/components/InstrumentOverlay.vue` | Minimal edit (help button + dialog wiring) |
| `src/types/instruments.ts` | Create (InstrumentDef, InstrumentHelp types) |
| `src/instruments/__tests__/InstrumentRegistry.test.ts` | Create |
| `src/instruments/__tests__/InstrumentFactory.test.ts` | Create |
| `src/instruments/__tests__/InstrumentTickController.test.ts` | Create |
| `src/types/__tests__/instrumentsData.test.ts` | Create |

---

## Open Question

The `useInstrumentProvider` composable needs `MarsSiteContext` to instantiate tick handlers via the factory. Two options:

**A)** Provider is initialized lazily: `initProvider(ctx)` called once from `MartianSiteView.vue` on mount. Subsequent `useInstrumentProvider()` calls return the already-initialized instance.

**B)** In Plan A, tick handlers are not instantiated at all — only `InstrumentDef[]` is loaded from JSON. `InstrumentTickController` is built in Plan B when full context is available.

Option B is simpler and safer for Plan A since we're not running the new tick system anyway. Option A builds more of the real infrastructure now.

**Decision: Option B.** Provider loads JSON and exposes defs only. Factory and tick controller are built and unit-tested but not instantiated in the live app. Plan B does all wiring.
