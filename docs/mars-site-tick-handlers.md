# Mars site tick handlers

The Mars site view splits per-frame work into small modules under `src/views/site-controllers/`. Each module exports a `create*TickHandler` factory that returns a handler with `tick(SiteFrameContext)` and `dispose()`.

`createMarsSiteTickHandlers` in `createMarsSiteTickHandlers.ts` is the single wiring point: it takes `MarsSiteViewContext`, constructs every handler with the right refs and callbacks, and exposes `disposeAll()` for teardown. `MarsSiteViewController` keeps the animation loop, Three.js lifecycle, and the **order** of tick phases (orbital drops, SAM queue, power, MastCam/ChemCam init, etc.); it does not need to list every ref passed into each handler.

When adding a new subsystem tick:

1. Implement `createFooTickHandler` in its own file (implementing `SiteTickHandler` where appropriate).
2. Register it in `createMarsSiteTickHandlers` and extend `MarsSiteTickHandlers`.
3. Call `fooHandler.tick(fctx)` from `createMarsSiteViewController`’s `animate` at the correct phase relative to other systems.
