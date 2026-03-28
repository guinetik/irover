# Mars Sky Overhaul Design

## Overview

Complete overhaul of the Martian sky shader and atmosphere system. Replaces the current flat tan-to-tan palette with a scientifically-informed sky model featuring morning blue shift, zenith darkening, sun blue corona, animated cloud wisps, weather-reactive atmosphere with visibility fog, and Phobos/Deimos moons with orbital mechanics.

Reference imagery: Curiosity Marker Band Valley sol composite (morning blue through afternoon gold), Curiosity noctilucent cloud capture (wispy high-altitude ice crystal clouds).

## Goals

- Sky color arc that shifts from blue-gray morning through butterscotch noon to golden-ochre afternoon, matching real Curiosity imagery.
- Visible separation between sky color and dust particle color (currently nearly identical).
- Animated high-altitude cloud wisps driven by site water ice index, time of day, and weather state.
- Phobos and Deimos as lit GLB meshes with correct orbital motion in the night sky.
- Weather-reactive atmosphere: wind and dust storms shift sky color, dim the sun, reduce visibility via scene fog.
- Blue forward-scattering corona around the sun during clear daytime conditions.

## Non-Goals

- Phobos solar transits/eclipses (future feature).
- Volumetric clouds or cloud geometry — wisps are shader-only fbm noise.
- Positional audio tied to wind/weather (separate sound system spec exists).

## Current State

`MarsSky.ts` owns a sky sphere with `mars-sky.frag.glsl`, a directional sun light, ambient light, and hemisphere light. The sky shader has:
- Day sky: narrow tan palette (sun side, zenith, anti-sun) with minimal variation.
- Horizon haze band.
- Dusk/dawn with blue sunset around sun.
- Night sky with procedural stars.
- Sun disc + inner/outer glow.

The shader receives only `uSunDirection` and `uTimeOfDay`. No weather input, no clouds, no moons.

## Design

### 1. Sky Color Arc Overhaul

Replace the current three-tone day palette with a time-of-day color arc sampled from Curiosity reference imagery.

**Color stops (zenith / horizon pairs):**

| Time of Sol | Zenith | Horizon |
|---|---|---|
| Early morning (0.25-0.30) | steel blue-gray `(0.55, 0.62, 0.70)` | pale dusty blue `(0.65, 0.68, 0.72)` |
| Late morning (0.35-0.40) | transitional blue-tan `(0.63, 0.58, 0.55)` | warm haze `(0.73, 0.68, 0.62)` |
| Midday (0.45-0.55) | salmon-tan `(0.72, 0.55, 0.42)` | bright warm haze `(0.82, 0.70, 0.55)` |
| Afternoon (0.60-0.70) | golden ochre `(0.80, 0.62, 0.38)` | white-gold `(0.88, 0.78, 0.58)` |
| Dusk (0.75-0.80) | deep brown-orange `(0.40, 0.25, 0.15)` | amber rim `(0.65, 0.40, 0.22)` |

**Zenith darkening:** Zenith at ~60% brightness of horizon during day. Steeper gradient than current — `h` exponent increased. Real Mars has a dark upper sky from less dust scattering path length at high angles.

**Morning blue shift:** The key missing feature. Before ~0.35 timeOfDay, zenith is distinctly blue-gray (not warm). Transitions smoothly to warm tones by midday. Uses a `morningBlue` factor based on `smoothstep(0.25, 0.40, timeOfDay)`.

**Anti-sun tint:** Preserved — the side opposite the sun is cooler/bluer during the day, more pronounced in morning.

### 2. Animated Cloud Wisps

Thin, high-altitude ice crystal clouds rendered as layered fbm noise in the sky fragment shader. No geometry.

**Noise structure:**
- Two fbm layers at different scales (large streaky wisps + fine detail) scrolling at different speeds.
- Directional stretch to create elongated cirrus-like streaks rather than round blobs.
- Drift direction from `uWindDirection` uniform. Drift speed from `uWindSpeed`.

**Density drivers:**
- `uWaterIceIndex` from terrain params: polar sites (0.95-1.0) get prominent clouds, dry volcanic summits (0.1-0.15) get almost none. Base cloud density = `waterIceIndex * 0.6`.
- Time-of-day modulation: most visible at dawn/dusk when sun angle catches ice crystals (backlit glow like the noctilucent reference). Thinner at noon. Modulator: `mix(0.4, 1.0, duskFactor + dawnFactor)`.
- Storm suppression: during active dust storms, dust overwhelms cloud visibility. Clouds fade out proportional to storm intensity.

**Color:**
- Bright white-cream when sunlit (forward scatter).
- Dim amber near horizon.
- Noctilucent glow at dusk/dawn edges — clouds catch sunlight after/before the surface is in shadow.

**Performance:** Two extra fbm calls (8 noise lookups total) on the sky sphere — not per-pixel on the scene. The sky sphere is low-poly (32x32 segments). Negligible cost.

### 3. Phobos and Deimos

Two GLB meshes (`public/phobos.glb`, `public/deimos.glb`) already exist with textures.

**Orbital mechanics (pure functions in `lib/`):**

- `phobosPosition(timeOfDay, sol)` — 7.65-hour orbit, rises west / sets east (retrograde due to orbit faster than Mars rotation). Angular rate: ~360° / 7.65h relative to surface.
- `deimosPosition(timeOfDay, sol)` — 30.3-hour orbit, rises east / sets west (normal). Nearly stationary — shifts slowly across the sky.
- Both return a direction vector (azimuth + elevation) for positioning on the sky dome.
- Phase angle computed from sun direction for correct illumination.

**Rendering:**
- Meshes loaded by `MarsSky` (or a new `MarsMoons` layer following the existing layer pattern: `init()`, `update()`, `dispose()`).
- Positioned at large distance (inside sky sphere, outside terrain) so they read as sky objects.
- Lit by the existing sun directional light — natural phase lighting.
- Scale tuned so Phobos subtends ~0.2° apparent (1/3 of Earth's moon), Deimos is star-sized (~0.05°).

**Visibility:**
- Fade out during daytime (too dim against bright sky). Visible during dusk/dawn/night.
- Fade out during storms (dust obscures).
- Phobos visibly moves across the night sky over minutes. Deimos appears nearly stationary.
- Phobos only visible from latitudes ±70° (close orbit). Use `latDeg` from terrain params if available.

### 4. Weather-Reactive Atmosphere + Visibility

Three layers of weather influence, all driven by `siteWeather` ref.

**Sky shader uniforms (new):**
- `uWindSpeed` (float, normalized) — dust haze intensity.
- `uDustStormLevel` (float, 0 = none, 1-5 = storm level) — atmosphere shift.
- `uWaterIceIndex` (float, 0-1) — cloud density.
- `uWindDirection` (vec3) — cloud drift direction.

**Sky shader behavior:**
- Higher wind pushes sky colors toward orange-tan, thickens horizon haze band.
- Active storms shift entire sky brownish-ochre via dust overlay that scales with storm level.
- Sun disc dims and reddens during storms.

**Sun and ambient light (MarsSky.ts):**
- `setWeather(windMs, stormLevel)` method on `MarsSky`.
- Storm dims `sunLight.intensity`: L1 ~-20%, L3 ~-50%, L5 ~-70%.
- Sun color shifts redder during storms (lerp toward deep orange).
- Ambient and hemisphere intensity drop proportionally.

**Scene fog (SiteScene):**
- `THREE.FogExp2` added to the scene.
- `SiteScene.setAtmosphere(windMs, stormPhase, stormLevel)` method.
- Calm wind: density ~0 (no fog). Moderate wind (8-12 m/s): slight haze, far terrain softens. Active L3+ storm: visibility noticeably reduced.
- Fog color matches sky horizon color for seamless blend. Updated each frame from `MarsSky`'s current horizon value.
- Density formula: `baseDensity = windFactor * 0.003 + stormLevel * 0.006`.

**Combined effect examples:**
- Clear morning: blue-gray sky, prominent blue sun corona, wispy clouds drifting slowly, full visibility, moons fading.
- L5 dust storm: deep ochre sky, sun nearly invisible, no clouds, no corona, visibility reduced to ~30m equivalent fog, moons hidden.

### 5. Sun Blue Corona

Blue forward-scattering through suspended dust particles — the signature Mars daytime feature.

**Implementation:** Additional term in the sky fragment shader's sun glow section.

- Corona color: ice-blue `(0.5, 0.65, 0.85)` blending to white near the disc.
- Shape: `pow(sunDot, 8.0)` for a medium-width ring wider than the existing tight inner glow.
- Daytime only: scales with `dayFactor`.
- Weather-dependent: `coronaStrength = mix(0.35, 0.0, dustFactor)` — prominent on clear days, fades as dust/storms overwhelm scattering.
- Time-dependent: strongest when sun is high (more atmosphere for scattering), fades at dawn/dusk where the existing blue sunset takes over.

## Architecture

### New files:
- `src/lib/areography/moonOrbits.ts` — Pure orbital math for Phobos/Deimos positions. No Three.js.
- `src/three/MarsMoons.ts` — Scene layer for moon meshes. Follows existing layer pattern (`init()`, `update()`, `dispose()`).

### Modified files:
- `src/three/shaders/mars-sky.frag.glsl` — Color arc, clouds, corona, weather uniforms.
- `src/three/MarsSky.ts` — New uniforms, weather method, fog color output.
- `src/three/SiteScene.ts` — Fog setup, `setAtmosphere()`, moon layer integration.
- `src/views/MarsSiteViewController.ts` — Pipe `siteWeather` to sky and scene atmosphere each frame.

### Data flow:
```
siteWeather (ref) → MarsSiteViewController render loop
  → MarsSky.setWeather(windMs, stormLevel)
    → sky shader uniforms (uWindSpeed, uDustStormLevel)
    → sun/ambient light intensity + color
  → SiteScene.setAtmosphere(windMs, stormPhase, stormLevel)
    → THREE.FogExp2 density + color
  → MarsMoons.update(timeOfDay, sol, nightFactor, stormLevel)
    → orbital positions from lib/areography/moonOrbits.ts
```

Terrain params (`waterIceIndex`, `latDeg`) are set once at scene init for cloud density and Phobos visibility.

## Testing

- `lib/areography/moonOrbits.ts` — Unit tests for orbital positions: Phobos rises west, Deimos rises east, correct angular rates, phase angle computation.
- `lib/weather/siteWeather.ts` — Existing tests cover weather computation; no changes needed.
- Sky shader and visual effects validated by visual inspection (shader work).
