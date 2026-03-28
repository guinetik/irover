# Mars Sky Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the flat Martian sky with a scientifically-informed atmosphere featuring time-of-day color arc, blue sun corona, animated cloud wisps, weather-reactive haze/fog, and Phobos/Deimos moons.

**Architecture:** The sky shader (`mars-sky.frag.glsl`) gets new uniforms for weather and clouds. `MarsSky.ts` gains a `setWeather()` method that modulates light intensities and passes weather state to the shader. A new `MarsMoons.ts` layer loads Phobos/Deimos GLBs and positions them using pure orbital math from `lib/areography/moonOrbits.ts`. `SiteScene.ts` wires fog density to weather state. The controller render loop pipes `siteWeather` to all systems each frame.

**Tech Stack:** Three.js (ShaderMaterial, GLTFLoader, FogExp2), GLSL ES, Vitest

**Spec:** `docs/superpowers/specs/2026-03-26-mars-sky-overhaul-design.md`

---

### Task 1: Moon Orbital Math (Pure Lib)

**Files:**
- Create: `src/lib/areography/moonOrbits.ts`
- Create: `src/lib/areography/__tests__/moonOrbits.test.ts`

This is pure math with no Three.js dependency — testable first.

- [ ] **Step 1: Write failing tests for Phobos orbit**

```ts
// src/lib/areography/__tests__/moonOrbits.test.ts
import { describe, it, expect } from 'vitest'
import { phobosPosition, deimosPosition, moonPhaseAngle } from '../moonOrbits'

describe('phobosPosition', () => {
  it('returns azimuth and elevation', () => {
    const pos = phobosPosition(0.5, 0)
    expect(pos).toHaveProperty('azimuthRad')
    expect(pos).toHaveProperty('elevationRad')
  })

  it('moves retrograde — azimuth decreases over time (rises west)', () => {
    // Phobos orbits faster than Mars rotates, so from the surface
    // it appears to move east-to-west (retrograde)
    const pos0 = phobosPosition(0.0, 0)
    const pos1 = phobosPosition(0.1, 0) // ~2.4h later in a 24.6h sol
    // Phobos angular rate relative to surface: 360° / 7.65h = ~47°/h
    // In 0.1 sol (~2.46h): ~116° of motion
    // Because it's retrograde, azimuth should have moved significantly
    const delta = pos1.azimuthRad - pos0.azimuthRad
    // Retrograde means the angular position wraps in the opposite direction
    // We check that it moved a large amount (> 1 radian)
    expect(Math.abs(delta)).toBeGreaterThan(1.0)
  })

  it('completes roughly one orbit in 7.65 game-hours', () => {
    // 7.65 hours = 7.65 / 24.6 ≈ 0.311 of a sol
    const pos0 = phobosPosition(0.0, 0)
    const pos1 = phobosPosition(0.311, 0)
    // Should be near the starting position (within ~0.3 rad tolerance)
    const azDiff = Math.abs(pos1.azimuthRad - pos0.azimuthRad) % (Math.PI * 2)
    const wrapped = Math.min(azDiff, Math.PI * 2 - azDiff)
    expect(wrapped).toBeLessThan(0.4)
  })
})

describe('deimosPosition', () => {
  it('returns azimuth and elevation', () => {
    const pos = deimosPosition(0.5, 0)
    expect(pos).toHaveProperty('azimuthRad')
    expect(pos).toHaveProperty('elevationRad')
  })

  it('moves prograde — appears nearly stationary over a short interval', () => {
    // Deimos orbit: 30.3h, Mars sol: 24.6h
    // Relative angular rate is very slow
    const pos0 = deimosPosition(0.0, 0)
    const pos1 = deimosPosition(0.1, 0)
    const delta = Math.abs(pos1.azimuthRad - pos0.azimuthRad)
    // Should move very little in 0.1 sol
    expect(delta).toBeLessThan(0.5)
  })
})

describe('moonPhaseAngle', () => {
  it('returns 0 when moon is in direction of sun (full phase)', () => {
    const sunDir = { x: 1, y: 0, z: 0 }
    const moonDir = { x: 1, y: 0, z: 0 }
    expect(moonPhaseAngle(sunDir, moonDir)).toBeCloseTo(0, 1)
  })

  it('returns PI when moon is opposite the sun (new phase)', () => {
    const sunDir = { x: 1, y: 0, z: 0 }
    const moonDir = { x: -1, y: 0, z: 0 }
    expect(moonPhaseAngle(sunDir, moonDir)).toBeCloseTo(Math.PI, 1)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/areography/__tests__/moonOrbits.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement moon orbital math**

```ts
// src/lib/areography/moonOrbits.ts

/** Orbital period in Mars solar hours (24.6h per sol). */
const PHOBOS_PERIOD_H = 7.65
const DEIMOS_PERIOD_H = 30.3
const SOL_HOURS = 24.6

/** Phobos orbital inclination to Mars equator (~1.08°). */
const PHOBOS_INCLINATION_RAD = 1.08 * Math.PI / 180
/** Deimos orbital inclination (~1.79°). */
const DEIMOS_INCLINATION_RAD = 1.79 * Math.PI / 180

/** Maximum latitude (degrees) from which Phobos is visible (~70°). */
export const PHOBOS_VISIBILITY_LAT = 70

export interface MoonPosition {
  /** Azimuth in radians (0 = east, PI/2 = north, PI = west, 3PI/2 = south). */
  azimuthRad: number
  /** Elevation in radians above horizon. Negative = below horizon. */
  elevationRad: number
}

/**
 * Compute apparent position of Phobos from the Martian surface.
 *
 * Phobos orbits in 7.65h — faster than Mars rotates (24.6h sol).
 * From the surface it rises in the west and sets in the east (retrograde apparent motion).
 *
 * @param timeOfDay Fractional sol 0..1 (0.25 = sunrise, 0.75 = sunset)
 * @param sol Integer sol count (shifts initial phase)
 */
export function phobosPosition(timeOfDay: number, sol: number): MoonPosition {
  // Phobos true orbital angular rate (rad/sol-hour)
  const orbitalRate = (2 * Math.PI) / PHOBOS_PERIOD_H
  // Mars surface rotation rate (rad/sol-hour)
  const surfaceRate = (2 * Math.PI) / SOL_HOURS
  // Apparent rate from surface (negative = retrograde)
  const apparentRate = surfaceRate - orbitalRate // negative since Phobos is faster

  const hoursIntoSol = timeOfDay * SOL_HOURS
  const totalHours = sol * SOL_HOURS + hoursIntoSol

  // Phobos azimuth (apparent motion from surface)
  const azimuthRad = (apparentRate * totalHours) % (2 * Math.PI)

  // Elevation oscillation from orbital inclination
  const orbitalPhase = (orbitalRate * totalHours) % (2 * Math.PI)
  const elevationBase = Math.sin(orbitalPhase) * PHOBOS_INCLINATION_RAD
  // Phobos is close enough that it rises/sets — simulate with a sinusoid
  // peaking when roughly overhead (azimuth-dependent elevation)
  const transitElevation = 0.7 // max ~40° above horizon at transit
  const elevationRad = transitElevation * Math.cos(azimuthRad) + elevationBase

  return { azimuthRad: ((azimuthRad % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI), elevationRad }
}

/**
 * Compute apparent position of Deimos from the Martian surface.
 *
 * Deimos orbits in 30.3h — slightly slower than Mars surface rotation.
 * Rises in the east, sets in the west (prograde), but very slowly.
 * Stays above horizon for ~2.5 sols at a time.
 *
 * @param timeOfDay Fractional sol 0..1
 * @param sol Integer sol count
 */
export function deimosPosition(timeOfDay: number, sol: number): MoonPosition {
  const orbitalRate = (2 * Math.PI) / DEIMOS_PERIOD_H
  const surfaceRate = (2 * Math.PI) / SOL_HOURS
  const apparentRate = surfaceRate - orbitalRate // positive since Deimos is slower

  const hoursIntoSol = timeOfDay * SOL_HOURS
  const totalHours = sol * SOL_HOURS + hoursIntoSol

  const azimuthRad = (apparentRate * totalHours) % (2 * Math.PI)

  const orbitalPhase = (orbitalRate * totalHours) % (2 * Math.PI)
  const elevationBase = Math.sin(orbitalPhase) * DEIMOS_INCLINATION_RAD
  // Deimos is farther out — higher elevation when visible, slower transit
  const transitElevation = 0.6
  const elevationRad = transitElevation * Math.cos(azimuthRad) + elevationBase

  return { azimuthRad: ((azimuthRad % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI), elevationRad }
}

/**
 * Phase angle between sun direction and moon direction (0 = full, PI = new).
 * Used for opacity/illumination of moon meshes.
 */
export function moonPhaseAngle(
  sunDir: { x: number; y: number; z: number },
  moonDir: { x: number; y: number; z: number },
): number {
  const dot = sunDir.x * moonDir.x + sunDir.y * moonDir.y + sunDir.z * moonDir.z
  return Math.acos(Math.max(-1, Math.min(1, dot)))
}

/**
 * Convert azimuth + elevation to a unit direction vector (Three.js Y-up).
 * Azimuth 0 = east (+X), PI/2 = north (+Z), PI = west (-X).
 */
export function moonDirFromAzEl(azimuthRad: number, elevationRad: number): { x: number; y: number; z: number } {
  const cosEl = Math.cos(elevationRad)
  return {
    x: Math.cos(azimuthRad) * cosEl,
    y: Math.sin(elevationRad),
    z: Math.sin(azimuthRad) * cosEl,
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/areography/__tests__/moonOrbits.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/areography/moonOrbits.ts src/lib/areography/__tests__/moonOrbits.test.ts
git commit -m "feat: add Phobos/Deimos orbital math (pure lib)"
```

---

### Task 2: Sky Shader Overhaul — Color Arc + Blue Corona + Weather Uniforms

**Files:**
- Modify: `src/three/shaders/mars-sky.frag.glsl` (full rewrite)
- Modify: `src/three/MarsSky.ts` (new uniforms, setWeather method)

No automated tests — shader work is visual. This task rewrites the sky fragment shader with the new color model and adds all new uniforms to `MarsSky.ts`.

- [ ] **Step 1: Rewrite the sky fragment shader**

Replace the entire contents of `src/three/shaders/mars-sky.frag.glsl` with the new shader. The new shader includes:
- 5-stop color arc (morning blue → midday salmon → afternoon gold → dusk → night)
- Steeper zenith-to-horizon gradient (~60% darkening at zenith)
- Morning blue factor (`smoothstep(0.25, 0.40, timeOfDay)`)
- Sun blue corona (`pow(sunDot, 8.0)`, weather-dependent intensity)
- Weather-reactive dust overlay (wind speed shifts colors orange, storm level dims sun)
- Cloud wisps (two-layer fbm with directional stretch, driven by water ice index + time + wind)
- Preserved: stars, sun disc, dusk blue sunset, anti-sun tint

New uniforms consumed by the shader:
- `uWindSpeed` (float, normalized — 1.0 = 5 m/s baseline)
- `uDustStormLevel` (float, 0-5)
- `uWaterIceIndex` (float, 0-1)
- `uWindDirection` (vec3, unit vector)
- `uTime` (float, simulation elapsed for cloud animation)

```glsl
// src/three/shaders/mars-sky.frag.glsl
uniform vec3 uSunDirection;
uniform float uTimeOfDay;
uniform float uWindSpeed;
uniform float uDustStormLevel;
uniform float uWaterIceIndex;
uniform vec3 uWindDirection;
uniform float uTime;

varying vec3 vWorldPos;

float hash(vec3 p) {
  p = fract(p * vec3(443.897, 441.423, 437.195));
  p += dot(p, p.yzx + 19.19);
  return fract((p.x + p.y) * p.z);
}

float noise2d(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = fract(sin(dot(i, vec2(127.1, 311.7))) * 43758.5453);
  float b = fract(sin(dot(i + vec2(1.0, 0.0), vec2(127.1, 311.7))) * 43758.5453);
  float c = fract(sin(dot(i + vec2(0.0, 1.0), vec2(127.1, 311.7))) * 43758.5453);
  float d = fract(sin(dot(i + vec2(1.0, 1.0), vec2(127.1, 311.7))) * 43758.5453);
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    v += a * noise2d(p);
    p *= 2.0;
    a *= 0.5;
  }
  return v;
}

void main() {
  vec3 dir = normalize(vWorldPos);
  float h = dir.y;

  float sunElevation = uSunDirection.y;
  float sunDot = max(0.0, dot(dir, uSunDirection));
  float antiSunDot = max(0.0, dot(dir, -uSunDirection));

  // --- Weather factors ---
  float windFactor = clamp(uWindSpeed, 0.0, 6.0);
  float stormFactor = clamp(uDustStormLevel / 5.0, 0.0, 1.0);
  float dustFactor = smoothstep(0.5, 3.0, windFactor) + stormFactor * 0.5;
  dustFactor = clamp(dustFactor, 0.0, 1.0);

  // --- Time-of-day color arc (5 stops, zenith/horizon pairs) ---
  // Morning: blue-gray. Midday: salmon-tan. Afternoon: golden ochre.
  float morningBlue = 1.0 - smoothstep(0.25, 0.40, uTimeOfDay);
  // Also apply symmetrically for pre-dawn
  morningBlue = max(morningBlue, 1.0 - smoothstep(0.75, 0.85, uTimeOfDay));

  // Zenith colors through the day
  vec3 zenithMorning = vec3(0.55, 0.62, 0.70);
  vec3 zenithMidday = vec3(0.72, 0.55, 0.42);
  vec3 zenithAfternoon = vec3(0.80, 0.62, 0.38);

  // Horizon colors through the day
  vec3 horizonMorning = vec3(0.65, 0.68, 0.72);
  vec3 horizonMidday = vec3(0.82, 0.70, 0.55);
  vec3 horizonAfternoon = vec3(0.88, 0.78, 0.58);

  // Blend zenith by time of day (morning -> midday -> afternoon)
  float middayT = smoothstep(0.30, 0.50, uTimeOfDay) * smoothstep(0.70, 0.50, uTimeOfDay);
  float afternoonT = smoothstep(0.50, 0.65, uTimeOfDay);

  vec3 zenithDay = mix(zenithMorning, zenithMidday, smoothstep(0.25, 0.42, uTimeOfDay));
  zenithDay = mix(zenithDay, zenithAfternoon, afternoonT);

  vec3 horizonDay = mix(horizonMorning, horizonMidday, smoothstep(0.25, 0.42, uTimeOfDay));
  horizonDay = mix(horizonDay, horizonAfternoon, afternoonT);

  // Steeper zenith-to-horizon gradient (~60% darkening at zenith)
  float zenithGrad = pow(max(0.0, h), 0.6);
  vec3 dayColor = mix(horizonDay, zenithDay * 0.6, zenithGrad);

  // Anti-sun tint — cooler/bluer opposite the sun, stronger in morning
  vec3 dayAntiSun = mix(vec3(0.55, 0.58, 0.62), vec3(0.50, 0.55, 0.65), morningBlue);
  dayColor = mix(dayColor, dayAntiSun, antiSunDot * 0.35 * (1.0 - dustFactor));

  // Sun-side warmth
  vec3 daySunSide = mix(horizonDay, vec3(0.85, 0.72, 0.55), 0.3);
  dayColor = mix(dayColor, daySunSide, pow(sunDot, 3.0) * 0.25);

  // --- Horizon haze (thick dusty band) ---
  float horizonBand = exp(-abs(h) * 2.5);
  vec3 hazeColor = mix(horizonDay, vec3(0.62, 0.68, 0.65), antiSunDot * 0.4 * (1.0 - dustFactor));
  dayColor = mix(dayColor, hazeColor, horizonBand * 0.65);

  // --- Weather: dust overlay on sky ---
  vec3 dustOchre = vec3(0.75, 0.55, 0.32);
  float weatherHaze = dustFactor * 0.5;
  dayColor = mix(dayColor, dustOchre, weatherHaze);

  // Storm: brownish cast, dims everything
  vec3 stormColor = vec3(0.50, 0.35, 0.22);
  dayColor = mix(dayColor, stormColor, stormFactor * 0.6);

  // --- Dusk/dawn ---
  vec3 duskHorizon = vec3(0.50, 0.30, 0.20);
  vec3 duskZenith = vec3(0.12, 0.08, 0.06);
  vec3 duskColor = mix(duskHorizon, duskZenith, max(0.0, h));
  // Mars blue sunset
  vec3 sunsetBlue = vec3(0.25, 0.40, 0.65);
  duskColor = mix(duskColor, sunsetBlue, pow(sunDot, 8.0) * 0.5);

  // --- Night ---
  vec3 nightColor = vec3(0.02, 0.015, 0.015);

  // --- Blend by sun elevation ---
  float dayFactor = smoothstep(-0.1, 0.3, sunElevation);
  float duskFactor = smoothstep(-0.25, -0.05, sunElevation) * smoothstep(0.3, 0.05, sunElevation);

  vec3 color = mix(nightColor, dayColor, dayFactor);
  color = mix(color, duskColor, duskFactor);

  // --- Sun disc + glow ---
  float sunDimming = 1.0 - stormFactor * 0.7;
  vec3 sunColor = mix(vec3(1.0, 0.85, 0.6), vec3(1.0, 0.6, 0.3), 1.0 - max(0.0, sunElevation));
  // Storm reddens sun
  sunColor = mix(sunColor, vec3(1.0, 0.4, 0.15), stormFactor * 0.6);

  // Disc
  float sunDisc = smoothstep(0.9995, 0.9999, sunDot);
  color += sunColor * sunDisc * 1.5 * sunDimming;
  // Inner glow
  float innerGlow = pow(sunDot, 128.0) * 0.8;
  color += sunColor * innerGlow * dayFactor * sunDimming;
  // Outer glow (wide, soft)
  float outerGlow = pow(sunDot, 16.0) * 0.15;
  color += sunColor * outerGlow * dayFactor * sunDimming;

  // --- Sun blue corona (Mars forward-scattering) ---
  // Visible during daytime, strongest when sun is high, suppressed by dust
  float coronaSunHeight = smoothstep(0.0, 0.5, sunElevation);
  float coronaStrength = mix(0.35, 0.0, dustFactor) * coronaSunHeight * dayFactor;
  vec3 coronaColor = mix(vec3(0.5, 0.65, 0.85), vec3(0.8, 0.85, 0.95), pow(sunDot, 16.0));
  float coronaShape = pow(sunDot, 8.0) - pow(sunDot, 64.0) * 0.5; // ring, not disc
  color += coronaColor * max(0.0, coronaShape) * coronaStrength;

  // Blue glow at dusk around sun (existing, preserved)
  float blueGlow = pow(sunDot, 12.0) * duskFactor;
  color += sunsetBlue * blueGlow * 0.5;

  // --- Dust haze layer (low altitude) ---
  float dustHaze = exp(-max(0.0, h) * 1.5) * (1.0 - exp(-max(0.0, h) * 20.0));
  vec3 dustHazeColor = mix(vec3(0.75, 0.58, 0.42), vec3(0.65, 0.62, 0.55), antiSunDot * 0.3);
  float hazeIntensity = 0.3 + windFactor * 0.08 + stormFactor * 0.3;
  color = mix(color, dustHazeColor, dustHaze * hazeIntensity * dayFactor);

  // --- Cloud wisps (high-altitude ice crystals) ---
  float cloudDensity = uWaterIceIndex * 0.6 * (1.0 - stormFactor);
  if (cloudDensity > 0.01 && h > 0.05) {
    // Directional stretch for cirrus-like streaks
    vec2 windDir2d = normalize(vec2(uWindDirection.x, uWindDirection.z) + 0.001);
    vec2 skyUv = dir.xz / (h + 0.1); // project onto dome
    // Stretch along wind direction
    float alongWind = dot(skyUv, windDir2d);
    float acrossWind = dot(skyUv, vec2(-windDir2d.y, windDir2d.x));
    vec2 stretchedUv = vec2(alongWind * 0.5, acrossWind * 1.5);

    // Two layers at different scales and speeds
    float drift = uTime * 0.02 * max(0.3, uWindSpeed);
    float cloud1 = fbm(stretchedUv * 1.5 + drift * 0.7);
    float cloud2 = fbm(stretchedUv * 3.0 - drift * 1.1 + 50.0);
    float cloudPattern = cloud1 * 0.6 + cloud2 * 0.4;

    // Threshold for wispy look (not full coverage)
    float cloudMask = smoothstep(0.4, 0.7, cloudPattern);

    // Time-of-day modulation: most visible at dawn/dusk (noctilucent glow)
    float dawnDuskBoost = smoothstep(0.3, 0.2, abs(sunElevation)) * 0.6;
    float cloudVisibility = mix(0.4, 1.0, dawnDuskBoost);

    // Height fade — clouds only in upper sky
    float cloudHeight = smoothstep(0.05, 0.25, h);

    // Cloud color: white-cream when sunlit, amber at horizon
    vec3 cloudColor = mix(vec3(0.85, 0.78, 0.65), vec3(0.95, 0.92, 0.88), max(0.0, sunElevation));
    // Noctilucent glow — clouds catch sunlight when surface is in shadow
    float noctilucent = duskFactor * pow(sunDot, 4.0) * 0.8;
    cloudColor += vec3(0.3, 0.25, 0.2) * noctilucent;

    float cloudAlpha = cloudMask * cloudDensity * cloudVisibility * cloudHeight * dayFactor;
    // Also show noctilucent at dusk
    cloudAlpha += cloudMask * cloudDensity * cloudHeight * noctilucent;
    cloudAlpha = clamp(cloudAlpha, 0.0, 0.5);

    color = mix(color, cloudColor, cloudAlpha);
  }

  // --- Stars at night (preserved from original) ---
  float nightStrength = 1.0 - dayFactor;
  if (nightStrength > 0.01 && h > 0.0) {
    vec3 cellSize = vec3(300.0);
    vec3 starCell = floor(dir * cellSize);
    vec3 starCenter = (starCell + 0.5) / cellSize;
    float starHash = hash(starCell);

    if (starHash > 0.993) {
      float angDist = length(dir - normalize(starCenter));
      float starRadius = 0.001 + starHash * 0.0008;
      float starBright = smoothstep(starRadius, starRadius * 0.3, angDist);
      float twinkle = sin(starHash * 6283.0 + uTimeOfDay * 40.0) * 0.3 + 0.7;
      vec3 starColor = mix(vec3(0.9, 0.9, 1.0), vec3(1.0, 0.85, 0.7), starHash * 2.0 - 1.0);
      // Stars dimmed by storm dust
      float starDimming = 1.0 - stormFactor * 0.8;
      color += starColor * starBright * twinkle * nightStrength * 1.2 * starDimming;
    }
  }

  gl_FragColor = vec4(color, 1.0);
}
```

- [ ] **Step 2: Add new uniforms and setWeather to MarsSky.ts**

Modify `src/three/MarsSky.ts`:

1. Add new uniforms to the ShaderMaterial constructor (after `uTimeOfDay`):
```ts
uWindSpeed: { value: 1.0 },
uDustStormLevel: { value: 0 },
uWaterIceIndex: { value: 0 },
uWindDirection: { value: new THREE.Vector3(0.6, 0, 0.4).normalize() },
uTime: { value: 0 },
```

2. Add a `private baseSunIntensity = 0` field and `private stormLevel = 0` field.

3. Add a `horizonColor` readonly field for fog color sync:
```ts
readonly horizonColor = new THREE.Color(0xd4b48c)
```

4. Add `setWeather` method:
```ts
/** Update sky atmosphere from live weather state. Called each frame. */
setWeather(windMs: number, stormLevel: number, windDirDeg: number, simElapsed: number) {
  const windNorm = windMs / 5 // same baseline as DustParticles
  this.material.uniforms.uWindSpeed.value = windNorm
  this.material.uniforms.uDustStormLevel.value = stormLevel
  this.material.uniforms.uTime.value = simElapsed

  // Wind direction to vec3
  const rad = (windDirDeg * Math.PI) / 180
  const windDir = this.material.uniforms.uWindDirection.value as THREE.Vector3
  windDir.set(-Math.sin(rad), 0, -Math.cos(rad))

  this.stormLevel = stormLevel
}
```

5. Add `setTerrain` method for one-time init:
```ts
/** Set terrain-driven sky params (called once at scene init). */
setTerrain(waterIceIndex: number) {
  this.material.uniforms.uWaterIceIndex.value = waterIceIndex
}
```

6. Modify `updateSun()` to apply storm dimming to lights:

After the existing intensity calculation (`this.sunLight.intensity = dawnRamp * 2.0 + ...`), add:
```ts
// Storm dimming
const stormDim = 1.0 - this.stormLevel * 0.14 // L5 = 70% reduction
this.baseSunIntensity = this.sunLight.intensity
this.sunLight.intensity *= stormDim
this.ambientLight.intensity *= stormDim
this.hemiLight.intensity *= stormDim

// Storm reddens sun color
if (this.stormLevel > 0) {
  const stormT = this.stormLevel / 5
  this.sunLight.color.lerp(new THREE.Color(0xff6622), stormT * 0.6)
}

// Update horizon color for fog sync
const dayT = THREE.MathUtils.smoothstep(elevation, -0.1, 0.3)
this._scratchColor.set(0.82, 0.70, 0.55).lerp(new THREE.Color(0x50351c), 1 - dayT)
this.horizonColor.copy(this._scratchColor)
```

- [ ] **Step 3: Verify build**

Run: `npx vue-tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/three/shaders/mars-sky.frag.glsl src/three/MarsSky.ts
git commit -m "feat: overhaul sky shader — color arc, blue corona, clouds, weather uniforms"
```

---

### Task 3: Weather-Reactive Fog in SiteScene

**Files:**
- Modify: `src/three/SiteScene.ts`

- [ ] **Step 1: Add setAtmosphere method to SiteScene**

In `src/three/SiteScene.ts`, add a `setAtmosphere` method after the existing `update` method. Also modify `init` to call `sky.setTerrain()`:

1. In `init()`, after `this.sky = new MarsSky(this.scene)` (line 138), add:
```ts
this.sky.setTerrain(params.waterIceIndex)
```

2. Add the `setAtmosphere` method:
```ts
/** Update fog density and color from weather state. */
setAtmosphere(windMs: number, stormLevel: number) {
  if (!this.scene.fog || !(this.scene.fog instanceof THREE.FogExp2)) return

  const windFactor = windMs / 5 // normalized
  const density = Math.max(0, windFactor * 0.003 + stormLevel * 0.006)
  this.scene.fog.density = density

  // Sync fog color with sky horizon for seamless blend
  if (this.sky) {
    this.scene.fog.color.copy(this.sky.horizonColor)
  }
}
```

- [ ] **Step 2: Verify build**

Run: `npx vue-tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/three/SiteScene.ts
git commit -m "feat: weather-reactive fog density and color in SiteScene"
```

---

### Task 4: Wire Weather to Sky and Fog in Controller

**Files:**
- Modify: `src/views/MarsSiteViewController.ts`

- [ ] **Step 1: Pipe siteWeather to sky and fog each frame**

In `src/views/MarsSiteViewController.ts`, find the render loop section (around line 926) where `siteScene.update()` is called. After that call, add weather wiring:

```ts
// Weather drives sky atmosphere, fog, and dust pass
const sw = siteWeather.value
if (siteScene.sky) {
  siteScene.sky.setWeather(
    sw.windMs,
    sw.dustStormLevel ?? 0,
    sw.windDirDeg,
    simulationTime,
  )
}
siteScene.setAtmosphere(sw.windMs, sw.dustStormLevel ?? 0)
```

This goes right after `siteScene.update(simulationTime, sceneDelta, camera.position, skyDelta)` and before the existing `dustPass` block.

- [ ] **Step 2: Verify build**

Run: `npx vue-tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Run tests**

Run: `npx vitest run`
Expected: All tests pass (no behavior changes to tested code)

- [ ] **Step 4: Commit**

```bash
git add src/views/MarsSiteViewController.ts
git commit -m "feat: wire siteWeather to sky shader and scene fog each frame"
```

---

### Task 5: MarsMoons Layer — Phobos and Deimos

**Files:**
- Create: `src/three/MarsMoons.ts`
- Modify: `src/three/SiteScene.ts` (add moon layer)
- Modify: `src/views/MarsSiteViewController.ts` (pass sol to scene update)

- [ ] **Step 1: Create MarsMoons layer**

```ts
// src/three/MarsMoons.ts
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import {
  phobosPosition,
  deimosPosition,
  moonDirFromAzEl,
  PHOBOS_VISIBILITY_LAT,
} from '@/lib/areography/moonOrbits'

const MOON_DISTANCE = 500 // inside sky sphere (900), outside terrain
const PHOBOS_SCALE = 1.8
const DEIMOS_SCALE = 0.8

export class MarsMoons {
  private phobos: THREE.Object3D | null = null
  private deimos: THREE.Object3D | null = null
  private scene: THREE.Scene
  private latDeg = 0

  constructor(scene: THREE.Scene) {
    this.scene = scene
  }

  async init(latDeg?: number): Promise<void> {
    this.latDeg = latDeg ?? 0
    const loader = new GLTFLoader()

    const [phobosGltf, deimosGltf] = await Promise.all([
      loader.loadAsync('/phobos.glb'),
      loader.loadAsync('/deimos.glb'),
    ])

    this.phobos = phobosGltf.scene
    this.phobos.scale.setScalar(PHOBOS_SCALE)
    this.scene.add(this.phobos)

    this.deimos = deimosGltf.scene
    this.deimos.scale.setScalar(DEIMOS_SCALE)
    this.scene.add(this.deimos)
  }

  update(timeOfDay: number, sol: number, nightFactor: number, stormLevel: number) {
    // Visibility: fade in at dusk/night, fade out during day and storms
    const visibility = nightFactor * (1.0 - Math.min(1, stormLevel / 3))

    if (this.phobos) {
      const visible = visibility > 0.05 && Math.abs(this.latDeg) < PHOBOS_VISIBILITY_LAT
      this.phobos.visible = visible
      if (visible) {
        const pos = phobosPosition(timeOfDay, sol)
        const dir = moonDirFromAzEl(pos.azimuthRad, pos.elevationRad)
        this.phobos.position.set(dir.x * MOON_DISTANCE, dir.y * MOON_DISTANCE, dir.z * MOON_DISTANCE)
        this.phobos.lookAt(0, 0, 0)
        // Opacity via material traversal
        this.setOpacity(this.phobos, visibility * (pos.elevationRad > 0 ? 1 : 0))
      }
    }

    if (this.deimos) {
      const visible = visibility > 0.05
      this.deimos.visible = visible
      if (visible) {
        const pos = deimosPosition(timeOfDay, sol)
        const dir = moonDirFromAzEl(pos.azimuthRad, pos.elevationRad)
        this.deimos.position.set(dir.x * MOON_DISTANCE, dir.y * MOON_DISTANCE, dir.z * MOON_DISTANCE)
        this.deimos.lookAt(0, 0, 0)
        this.setOpacity(this.deimos, visibility * (pos.elevationRad > 0 ? 1 : 0))
      }
    }
  }

  private setOpacity(obj: THREE.Object3D, opacity: number) {
    obj.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
        for (const mat of materials) {
          if (mat instanceof THREE.MeshStandardMaterial || mat instanceof THREE.MeshBasicMaterial) {
            mat.transparent = opacity < 0.99
            mat.opacity = opacity
          }
        }
      }
    })
  }

  dispose() {
    if (this.phobos) {
      this.phobos.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          const mesh = child as THREE.Mesh
          mesh.geometry.dispose()
          const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
          materials.forEach((m) => m.dispose())
        }
      })
      this.scene.remove(this.phobos)
    }
    if (this.deimos) {
      this.deimos.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          const mesh = child as THREE.Mesh
          mesh.geometry.dispose()
          const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
          materials.forEach((m) => m.dispose())
        }
      })
      this.scene.remove(this.deimos)
    }
  }
}
```

- [ ] **Step 2: Integrate MarsMoons into SiteScene**

In `src/three/SiteScene.ts`:

1. Add import at top:
```ts
import { MarsMoons } from './MarsMoons'
```

2. Add field after `sky`:
```ts
moons: MarsMoons | null = null
```

3. In `init()`, after `this.sky.setTerrain(params.waterIceIndex)`, add:
```ts
// Mars moons
this.moons = new MarsMoons(this.scene)
await this.moons.init(params.latDeg)
```

4. In `update()`, after `this.sky?.update(skyDelta, roverPos)`, add:
```ts
// Note: moons are updated from controller with sol count
```

5. In `dispose()`, before `this.sky?.dispose()`, add:
```ts
this.moons?.dispose()
```

- [ ] **Step 3: Update controller to pass sol and call moon update**

In `src/views/MarsSiteViewController.ts`, in the render loop after the weather wiring added in Task 4:

```ts
// Moon orbital positions
if (siteScene.moons && siteScene.sky) {
  siteScene.moons.update(
    siteScene.sky.timeOfDay,
    marsSol.value,
    siteScene.sky.nightFactor,
    sw.dustStormLevel ?? 0,
  )
}
```

Also check that `marsSol` is accessible in the render loop scope. It's already used at line 796 as `sol: marsSol.value`, so it's in scope.

- [ ] **Step 4: Verify build**

Run: `npx vue-tsc --noEmit`
Expected: No errors

- [ ] **Step 5: Run all tests**

Run: `npx vitest run`
Expected: All tests pass

- [ ] **Step 6: Commit**

```bash
git add src/three/MarsMoons.ts src/three/SiteScene.ts src/views/MarsSiteViewController.ts
git commit -m "feat: add Phobos and Deimos moons with orbital motion"
```

---

### Task 6: Visual Smoke Test and Tuning

**Files:**
- Possibly tweak: `src/three/shaders/mars-sky.frag.glsl` (color values)
- Possibly tweak: `src/three/MarsSky.ts` (light intensities)
- Possibly tweak: `src/three/MarsMoons.ts` (scale, distance)

This is a visual verification task. No automated tests.

- [ ] **Step 1: Start dev server and test morning sky**

Run: `npm run dev`

Navigate to a landing site (e.g. Curiosity). Use the time-of-day control or wait for morning. Verify:
- Morning sky is blue-gray at zenith, not warm tan
- Horizon is brighter than zenith
- Blue sun corona visible around the sun disc during clear daytime
- Color shifts to warm butterscotch by midday, golden in afternoon

- [ ] **Step 2: Test weather reactivity**

Enable REMS, wait for or trigger a dust storm. Verify:
- Sky shifts orange/ochre during storms
- Sun dims and reddens
- Fog thickens — distant terrain fades
- Clouds disappear during storms
- Stars dim during storms at night

- [ ] **Step 3: Test clouds**

Navigate to a polar site (North Polar Cap, waterIceIndex: 1.0). Verify:
- Wispy cloud streaks visible in upper sky
- Clouds drift with wind direction
- Clouds brighter at dawn/dusk (noctilucent glow)
- Navigate to Olympus Mons (waterIceIndex: 0.15) — clouds should be minimal/absent

- [ ] **Step 4: Test moons**

Wait for nighttime. Verify:
- Phobos visible, moving noticeably across the sky (retrograde — west to east)
- Deimos visible, nearly stationary
- Both fade at dawn, invisible during day
- Both invisible during storms
- Navigate to a polar site (lat 90) — Phobos should not be visible

- [ ] **Step 5: Final build check**

Run: `npx vue-tsc --noEmit && npx vitest run`
Expected: Clean build, all tests pass

- [ ] **Step 6: Commit any tuning adjustments**

```bash
git add -u
git commit -m "fix: tune sky colors, moon scale, and fog density from visual testing"
```
