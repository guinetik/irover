# Martian site view context bridge

`src/views/martianSiteViewContext.ts` exports `buildMarsSiteViewContext` and the `MartianSiteViewContextDeps` type. The function turns the view’s refs, composable handles, and APXS minigame state into a `MarsSiteViewContext` for `createMarsSiteViewController`.

`MartianSiteView.vue` keeps a thin `createSiteControllerContext()` that passes live refs and `getApxsCompositionWeights: () => apxsCompositionData` so JSON-loaded composition weights stay in the view module while the assembly logic lives in plain TypeScript.
