import { ref } from 'vue'
import type { TerrainParams } from '@/three/terrain/TerrainGenerator'

/** Human-readable label for dust storm intensity (levels 1–5). */
export const DUST_STORM_LEVEL_LABELS = ['', 'Minor', 'Moderate', 'Strong', 'Severe', 'Extreme'] as const

/** Live REMS readouts for HUD / instrument card (also mirrored onto {@link REMSController}). */
export interface RemsHudSnapshot {
  available: boolean
  pressureHpa: number
  humidityPct: number
  tempC: number
  windMs: number
  windDirDeg: number
  windDirCompass: string
  uvIndex: number
  /** `none` outside storm; `incoming` / `active` while REMS storm sequence runs. */
  dustStormPhase: 'none' | 'incoming' | 'active'
  /** 1–5 while incoming or active; `null` otherwise. */
  dustStormLevel: number | null
}

export interface RemsWeatherTickInput {
  deltaSeconds: number
  timeOfDay: number
  sol: number
  simulationTime: number
  terrain: TerrainParams | null
  /** REMS passive subsystem surveying (ACTIVATE). */
  remsOn: boolean
  /** Site air temperature from thermal diurnal model (°C) — REMS reports this when on. */
  ambientEffectiveC: number
}

type StormPhase = 'idle' | 'incoming' | 'active' | 'cooldown'

function kelvinToCelsius(k: number): number {
  return k - 273.15
}

/**
 * Same phase as {@link useMarsThermal} diurnal curve so REMS air temp matches heater ambient model.
 */
function diurnalAmbientC(timeOfDay: number, minK: number, maxK: number): number {
  const minC = kelvinToCelsius(minK)
  const maxC = kelvinToCelsius(maxK)
  const phase = timeOfDay * Math.PI * 2
  const t = (Math.cos(phase) + 1) / 2
  return maxC + (minC - maxC) * t
}

/** Deterministic 0..1 from site + sol + salt (stable replays). */
function siteRng01(siteSeed: number, sol: number, salt: number): number {
  const x = Math.sin(siteSeed * 0.001 + sol * 12.9898 + salt * 78.233) * 43758.5453
  return x - Math.floor(x)
}

const COMPASS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'] as const

/**
 * Maps meteorological wind direction (deg, direction wind blows **from**) to compass label.
 */
export function windFromDegToCompass(deg: number): string {
  const d = ((deg % 360) + 360) % 360
  const idx = Math.round(d / 22.5) % 16
  return COMPASS[idx] ?? 'N'
}

function siteBaseWindMs(p: TerrainParams): number {
  let w = 2.5 + p.roughness * 7 + p.dustCover * 5
  if (p.featureType === 'polar-cap') w += 3
  if (p.featureType === 'canyon') w += 1.5
  return w
}

function sitePressureHpa(p: TerrainParams): number {
  let base = 610 - p.elevation * 14
  if (p.featureType === 'polar-cap') base -= 8
  return base
}

function siteHumidityFraction(p: TerrainParams): number {
  const h = 0.015 + p.waterIceIndex * 0.1 - p.dustCover * 0.025 + p.silicateIndex * 0.012
  return Math.max(0.001, Math.min(0.12, h))
}

/**
 * Peak sustained wind (m/s) for a dust storm — scales sharply with level and site dust.
 * Exported for unit tests.
 */
export function peakStormWindMs(level: number, dustCover: number, simulationTime: number): number {
  const L = Math.max(1, Math.min(5, level))
  const base = 14 + L * 16 + dustCover * 28
  const gust = Math.sin(simulationTime * (4.2 + L * 0.35)) * (6 + L * 5)
  const micro = Math.sin(simulationTime * 11.7) * (2 + L)
  return Math.max(18, base + gust + micro)
}

/**
 * Site-driven REMS weather, dust-storm notices (REMS on only), and HUD snapshot for Vue.
 */
export function useSiteRemsWeather() {
  const solClockAmbientC = ref<number | null>(null)
  const remsHud = ref<RemsHudSnapshot>({
    available: false,
    pressureHpa: 0,
    humidityPct: 0,
    tempC: 0,
    windMs: 0,
    windDirDeg: 0,
    windDirCompass: 'N',
    uvIndex: 0,
    dustStormPhase: 'none',
    dustStormLevel: null,
  })
  const remsStormIncomingText = ref<string | null>(null)
  const remsStormActiveText = ref<string | null>(null)

  let stormPhase: StormPhase = 'idle'
  let stormTimer = 0
  /** Seconds until next idle-phase storm check. */
  let idleCountdown = 55
  let stormSalt = 0
  let wasRemsOn = false
  /** 1–5 for the current / last storm event (set when incoming starts). */
  let stormLevel = 1

  function resetStormState(): void {
    stormPhase = 'idle'
    stormTimer = 0
    idleCountdown = 55
    stormLevel = 1
    remsStormIncomingText.value = null
    remsStormActiveText.value = null
  }

  function emptyHud(): RemsHudSnapshot {
    return {
      available: false,
      pressureHpa: 0,
      humidityPct: 0,
      tempC: 0,
      windMs: 0,
      windDirDeg: 0,
      windDirCompass: '—',
      uvIndex: 0,
      dustStormPhase: 'none',
      dustStormLevel: null,
    }
  }

  /**
   * Advances REMS readings and dust-storm messaging for one frame.
   */
  function tickRemsWeather(input: RemsWeatherTickInput): void {
    const { terrain, remsOn, ambientEffectiveC, simulationTime, timeOfDay, sol, deltaSeconds } = input
    const dustCover = terrain?.dustCover ?? 0.45
    const stormSeed = terrain?.seed ?? 1
    const stormChance = 0.04 + dustCover * 0.14
    const dt = deltaSeconds

    if (!remsOn) {
      wasRemsOn = false
      solClockAmbientC.value = null
      remsHud.value = emptyHud()
      remsStormIncomingText.value = null
      remsStormActiveText.value = null
      stormPhase = 'idle'
      stormTimer = 0
      idleCountdown = 55
      return
    }

    if (!wasRemsOn) {
      wasRemsOn = true
      idleCountdown = Math.max(idleCountdown, 28)
    }

    solClockAmbientC.value = ambientEffectiveC

    // --- Dust storm FSM (before readouts so wind/pressure react) ---
    if (stormPhase === 'idle') {
      idleCountdown -= dt
      if (idleCountdown <= 0) {
        if (siteRng01(stormSeed, sol, stormSalt + 100) < stormChance) {
          stormPhase = 'incoming'
          stormTimer = 22
          stormLevel = 1 + Math.floor(siteRng01(stormSeed, sol, stormSalt + 777) * 5)
          const label = DUST_STORM_LEVEL_LABELS[stormLevel] ?? 'Moderate'
          remsStormIncomingText.value = `REMS: Level ${stormLevel} (${label}) dust storm approaching — expect high winds.`
          remsStormActiveText.value = null
        } else {
          stormSalt += 1
          idleCountdown = 25 + siteRng01(stormSeed, sol, stormSalt) * 95
        }
      }
    } else if (stormPhase === 'incoming') {
      stormTimer -= dt
      if (stormTimer <= 0) {
        stormPhase = 'active'
        stormTimer = 48
        remsStormIncomingText.value = null
        const label = DUST_STORM_LEVEL_LABELS[stormLevel] ?? 'Moderate'
        remsStormActiveText.value = `Regional dust storm in progress — Level ${stormLevel} (${label}).`
      }
    } else if (stormPhase === 'active') {
      stormTimer -= dt
      if (stormTimer <= 0) {
        stormPhase = 'cooldown'
        stormTimer = 75
        remsStormActiveText.value = null
      }
    } else if (stormPhase === 'cooldown') {
      stormTimer -= dt
      if (stormTimer <= 0) {
        stormPhase = 'idle'
        stormSalt += 17
        idleCountdown = 40 + siteRng01(stormSeed, sol, stormSalt) * 100
      }
    }

    const stormAffectsReadouts = stormPhase === 'incoming' || stormPhase === 'active'
    const hudStormPhase: RemsHudSnapshot['dustStormPhase'] =
      stormPhase === 'incoming' ? 'incoming' : stormPhase === 'active' ? 'active' : 'none'
    const hudStormLevel = stormAffectsReadouts ? stormLevel : null

    // --- Base environment ---
    if (!terrain) {
      let windMs = 5
      let pressureHpa = 610
      let humidityPct = 2
      let tempC = ambientEffectiveC
      let uvIndex = 3
      const windDirDeg = 90
      if (stormAffectsReadouts) {
        const peak = peakStormWindMs(stormLevel, dustCover, simulationTime)
        const ramp =
          stormPhase === 'incoming' ? 1 - Math.max(0, Math.min(1, stormTimer / 22)) : 1
        windMs = stormPhase === 'incoming' ? 5 + (peak - 5) * ramp : peak
        pressureHpa -= 2 * stormLevel
        humidityPct = Math.max(0.2, humidityPct - stormLevel * 0.4)
        uvIndex = Math.max(0, uvIndex - stormLevel * 0.8)
        tempC -= 0.15 * stormLevel
      }
      remsHud.value = {
        available: true,
        pressureHpa,
        humidityPct,
        tempC,
        windMs,
        windDirDeg,
        windDirCompass: windFromDegToCompass(windDirDeg),
        uvIndex,
        dustStormPhase: hudStormPhase,
        dustStormLevel: hudStormLevel,
      }
      return
    }

    const seed = terrain.seed
    const t = diurnalAmbientC(timeOfDay, terrain.temperatureMinK, terrain.temperatureMaxK)
    const micro =
      Math.sin(simulationTime * 0.55) * 1.1 +
      Math.sin(simulationTime * 1.83) * 0.45 +
      Math.sin(simulationTime * 0.09 + seed) * 0.35
    let tempC = t + micro

    const pBase = sitePressureHpa(terrain)
    let pressureHpa = pBase + Math.sin(simulationTime * 0.31 + seed) * 1.2 + siteRng01(seed, sol, 7) * 0.4

    const humFrac = siteHumidityFraction(terrain)
    let humidityPct = Math.max(
      0.1,
      Math.min(
        20,
        humFrac * 100 + Math.sin(simulationTime * 0.42) * 0.35 - terrain.dustCover * 1.5,
      ),
    )

    const wBase = siteBaseWindMs(terrain)
    let windMs = Math.max(
      0.2,
      wBase +
        Math.sin(simulationTime * 0.67 + seed * 0.01) * 2.2 +
        Math.sin(simulationTime * 2.1) * 0.9,
    )

    let windDirDeg =
      (terrain.seed * 0.37 + sol * 41.7 + simulationTime * 8.5 + Math.sin(simulationTime * 0.15) * 25) % 360

    const sunUp = 0.5 + 0.5 * Math.sin((timeOfDay - 0.25) * Math.PI * 2)
    let uvIndex = Math.max(
      0,
      Math.min(
        12,
        3 + sunUp * 5 - terrain.dustCover * 2 + siteRng01(seed, sol, 3) * 0.8,
      ),
    )

    if (stormAffectsReadouts) {
      const peak = peakStormWindMs(stormLevel, dustCover, simulationTime)
      const ramp = stormPhase === 'incoming' ? 1 - Math.max(0, Math.min(1, stormTimer / 22)) : 1
      windMs = stormPhase === 'incoming' ? windMs + (peak - windMs) * ramp : peak
      windDirDeg += Math.sin(simulationTime * (2.1 + stormLevel * 0.4)) * (18 + stormLevel * 6)
      pressureHpa -= 1.2 * stormLevel + dustCover * 4
      humidityPct = Math.max(0.15, humidityPct - stormLevel * 0.55)
      uvIndex = Math.max(0, uvIndex - stormLevel * 1.1 - dustCover * 1.5)
      tempC -= 0.4 * stormLevel + dustCover * 0.6
    }

    const windDirCompass = windFromDegToCompass(windDirDeg)

    remsHud.value = {
      available: true,
      pressureHpa,
      humidityPct,
      tempC,
      windMs,
      windDirDeg,
      windDirCompass,
      uvIndex,
      dustStormPhase: hudStormPhase,
      dustStormLevel: hudStormLevel,
    }
  }

  return {
    solClockAmbientC,
    remsHud,
    remsStormIncomingText,
    remsStormActiveText,
    tickRemsWeather,
    /** Test hook: clear storm timers. */
    resetStormState,
  }
}
