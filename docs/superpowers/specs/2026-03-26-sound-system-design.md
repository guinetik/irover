# Robust Game-Style Sound System Design

## Overview

Build a shared 2D-first sound system for the app that replaces the current ad hoc `HTMLAudioElement` usage with a reusable game-audio layer. The system should support UI feedback, DSN and voice-log playback, reactive one-shots, priority ducking, reusable post-effect presets, centralized loading, and a clean path to future ambient and music layers.

## Goals

- Replace direct component-owned audio playback with a centralized audio service.
- Make `ui`, `voice`, and `sfx` first-class categories with separate volume and runtime behavior.
- Support reusable effect presets, especially a `dsn-radio` preset for radio-like DSN playback.
- Add robust browser unlock, loading, failure handling, and playback lifecycle management.
- Keep gameplay code decoupled from `howler.js` so the audio backend can evolve later.
- Leave room for future `ambient`, `music`, and positional audio without redesigning the API.

## Non-Goals

- No positional 3D audio in the first implementation.
- No full DAW-style authoring pipeline or in-editor audio tooling.
- No mandatory event-bus-only architecture in the first version.
- No requirement to migrate every future sound class immediately; the first milestone focuses on current DSN usage plus the shared foundation for more cues.

## Current State

Audio is currently managed in isolated components:

- `src/views/MartianSiteView.vue` keeps a shared `HTMLAudioElement` for DSN auto-play and performs its own browser unlock workaround.
- `src/components/DSNArchiveDialog.vue` creates and tears down a separate `HTMLAudioElement` for archive playback and tracks progress locally.

This works for one narrow feature, but it does not provide category control, ducking, shared effects, unified loading, or a safe API for future gameplay sounds.

## Recommended Foundation

Use `howler.js` as the playback foundation and wrap it in an internal game-audio facade. `howler.js` gives the project a stable audio abstraction for browser playback, while the app-owned facade provides the structure a game-style sound system needs: category buses, manifest-driven sound definitions, preload policy, ducking, effect presets, and testable app-level behavior.

## Architecture

### Core Components

#### `src/audio/AudioManager.ts`

The central runtime service. Responsibilities:

- Initialize audio once for the app.
- Manage browser unlock and suspended/resumed state.
- Own master and per-category volume/mute state.
- Load and cache manifest-defined sounds.
- Route playback requests to the correct category behavior.
- Enforce concurrency and exclusivity rules.
- Apply ducking when high-priority sounds play.
- Expose lightweight playback handles to the rest of the app.

#### `src/audio/audioManifest.ts`

The declarative registry for all sounds. Every sound entry must define:

- Stable sound id.
- Category (`ui`, `voice`, `sfx`, later `ambient`, `music`).
- Source URL or variant URLs.
- Playback mode and concurrency behavior.
- Load strategy.
- Default volume.
- Optional effect preset.

This manifest becomes the single source of truth for adding new sounds.

#### `src/audio/audioTypes.ts`

Shared TypeScript definitions for:

- Sound ids and category names.
- Load strategies.
- Playback options and per-play overrides.
- Effect preset ids and preset parameter shapes.
- Playback handle contract returned by the manager.

#### `src/audio/audioEffects.ts`

Reusable effect preset definitions and effect helpers. The first implementation should define presets at the app layer rather than scattering filter logic in components.

#### `src/audio/useAudio.ts`

A small Vue-facing composable that exposes the manager in a component-safe way. Components should call the composable or injected facade, not instantiate sound objects directly.

#### Optional: `src/audio/audioSettingsStore.ts`

If settings are included in the first pass, this module persists master/category volume and mute preferences. It should stay separate from playback logic so settings remain decoupled from runtime audio management.

## Category Model

The first version should treat these groups as first-class logical buses:

- `ui`: clicks, confirmation, errors, modal open/close, terminal beeps.
- `voice`: DSN logs, archive playback, future spoken transmissions or narrated clips.
- `sfx`: reactive one-shots such as discoveries, alerts, warnings, and instrument feedback.

Future-ready categories:

- `ambient`
- `music`

Each category needs:

- Independent volume control.
- Mute state.
- Fade support for future transitions.
- Eligibility for ducking policies.

## Playback Semantics

Every sound definition must declare its intended runtime behavior rather than relying on defaults hidden in component code.

Examples:

- UI click sounds can be `restart` or `rate-limited`.
- Alerts can be `single-instance` by logical key.
- Voice playback should be exclusive on the `voice` channel so starting a new transmission stops the previous one cleanly.
- Some one-shots may allow overlap, while others should collapse duplicate triggers during cooldown windows.

The public API should expose simple intent-driven calls such as:

- `play(soundId, options?)`
- `stop(handleOrSoundId)`
- `stopCategory(category)`
- `preload(idsOrCategory)`
- `setCategoryVolume(category, value)`
- `setMuted(category, muted)`

Components should never manipulate `howler.js` instances directly.

## Browser Unlock and Lifecycle

The app should perform audio unlock once at the system level after the first trusted user gesture. The unlock sequence must be centralized so components no longer register their own unlock listeners or silent-sample hacks.

The system should also support:

- `resume()` when the app regains focus or audio is re-enabled.
- `suspend()` or equivalent pause behavior when desired.
- Global cleanup on app teardown.

If the browser blocks playback before unlock, the manager should fail safely and log useful diagnostics without crashing gameplay flow.

## Loading Strategy

The system should support tiered loading so audio stays responsive without preloading the entire future catalog.

### Eager

Use for tiny, high-frequency sounds that should always feel immediate:

- Core UI clicks
- Confirm and error cues

### Lazy On First Use

Use for reactive one-shots that may or may not be triggered in a session:

- Discovery stingers
- Warning alarms
- Instrument reaction sounds

### Stream or Late Load

Use for larger or numerous voice assets:

- DSN recordings
- Archive voice logs

The manager should expose preload helpers so screens can warm likely-needed audio ahead of time, such as preloading known DSN assets when opening the archive dialog.

## Effect Presets

Effects must be reusable presets attached to sound definitions or playback requests, not hand-written component behavior.

Initial preset targets:

- `dsn-radio`
- `helmet-comms`
- `terminal-beep`

### `dsn-radio`

This preset should make DSN and voice-log playback feel like radio communication rather than raw clean media. The design target is light communication-band coloration, not unintelligible distortion.

The preset should be parameterized so it can evolve without API churn:

- Low-pass and/or band-pass shaping for limited frequency range.
- Mild distortion or saturation if supported cleanly.
- Optional subtle noise bed later, but not required in the first pass.
- Adjustable wetness or intensity for different transmission styles.

The first implementation should validate what `howler.js` directly supports versus where a small Web Audio bridge is required for effects. The app-facing API should still expose a stable preset abstraction regardless of the underlying effect wiring.

## Ducking Rules

Ducking should be policy-driven at the manager layer.

Initial rules:

- `voice` ducks `ui` and `sfx` lightly while active.
- High-priority alerts may duck other categories briefly.
- Ducking must use fades for attack and release to avoid harsh jumps.

Future-facing rule support:

- `voice` ducks `music` and `ambient` more aggressively once those categories exist.

Ducking policies should be declarative enough to expand without rewriting playback call sites.

## Failure Handling

Audio failures should not break gameplay. The manager should:

- Warn in development when a sound id is missing from the manifest.
- Warn when a file fails to load or play.
- Return a safe no-op handle when playback cannot proceed.
- Avoid throwing runtime exceptions into UI flows unless the caller explicitly requests strict behavior.

Critical sounds can be supported later, but the default contract should be resilient and silent from the player’s perspective.

## Vue Integration

Vue components should depend on the audio facade, not raw media objects.

Expected migration pattern:

- `MartianSiteView.vue` requests DSN auto-play through the audio manager.
- `DSNArchiveDialog.vue` requests voice playback and subscribes to a playback handle or manager state for progress.
- Future components request UI and feedback sounds through the same shared entry point.

Component responsibilities should stay limited to:

- choosing the correct sound id,
- optionally passing a small set of overrides,
- reacting to playback state if needed.

## Migration Plan Shape

The first implementation milestone should cover:

1. Introduce the audio system foundation and library integration.
2. Register voice and DSN sounds in the manifest.
3. Migrate current DSN playback in `MartianSiteView.vue`.
4. Migrate archive playback in `DSNArchiveDialog.vue`.
5. Add the first reusable effect preset for `dsn-radio`.
6. Add initial UI and reactive one-shot support points for future adoption.

This sequence replaces the current duplicated audio logic early while proving the architecture on a real feature.

## Testing Strategy

Testing should focus on app-owned behavior rather than browser audio fidelity.

Unit tests should cover:

- Manifest validation and type-safe sound lookup.
- Category routing.
- Voice exclusivity rules.
- Duck enter and release behavior.
- Loading strategy decisions.
- Safe failure behavior when playback or asset loading fails.

Component tests should verify that UI code requests the correct cues or playback transitions rather than asserting actual speaker output.

## Decoupling Rules

To keep the system maintainable:

- Components must not construct `Audio`, `Howl`, or direct Web Audio nodes.
- `howler.js` must stay behind app-owned interfaces.
- Effect preset names and category semantics belong to app code, not library-specific APIs.
- Future migration to richer Web Audio processing should not require call-site rewrites.

## Success Criteria

This design is successful when:

- Current DSN playback is fully routed through the shared audio system.
- New UI, voice, and reactive sounds can be added declaratively through the manifest.
- Voice playback can duck other categories automatically.
- DSN playback can use a reusable radio-style effect preset.
- Components remain simple and decoupled from playback internals.
- The system can absorb future `ambient` and `music` layers without restructuring the public API.
