import { ref } from 'vue'
import type { TerrainParams } from '@/types/terrain'
import { DUST_STORM_LEVEL_LABELS } from '@/lib/weather/rems'
import { windFromDegToCompass } from '@/lib/weather/rems'
import {
  type SiteWeatherSnapshot,
  type StormState,
  computeSiteWeather,
  createStormState,
  tickStormFSM,
} from '@/lib/weather/siteWeather'
import { siteRng01 } from '@/lib/weather/rems'

export {
  DUST_STORM_LEVEL_LABELS,
  peakStormWindMs,
  windFromDegToCompass,
} from '@/lib/weather/rems'

export type { SiteWeatherSnapshot } from '@/lib/weather/siteWeather'

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
  /** Site elevation in km (relative to Mars datum). */
  elevationKm: number
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
    elevationKm: 0,
    dustStormPhase: 'none',
    dustStormLevel: null,
  }
}

/**
 * Site-driven REMS weather, dust-storm notices (REMS on only), and HUD snapshot for Vue.
 *
 * Weather physics live in `lib/weather/siteWeather.ts` — this composable is the Vue glue
 * that owns refs, storm text, and the REMS display gate.
 */
export function useSiteRemsWeather() {
  const solClockAmbientC = ref<number | null>(null)
  const remsHud = ref<RemsHudSnapshot>(emptyHud())
  const remsStormIncomingText = ref<string | null>(null)
  const remsStormActiveText = ref<string | null>(null)
  /** Always-live weather state — updates regardless of REMS instrument toggle. */
  const siteWeather = ref<SiteWeatherSnapshot>({
    windMs: 5,
    windDirDeg: 0,
    tempC: -23,
    pressureHpa: 610,
    humidityPct: 2,
    uvIndex: 3,
    dustStormPhase: 'none',
    dustStormLevel: null,
    renderWindMs: 5,
    renderWindDirDeg: 0,
    renderDustStormLevel: 0,
  })

  let storm: StormState = createStormState()
  let wasRemsOn = false

  function resetStormState(): void {
    storm = createStormState()
    remsStormIncomingText.value = null
    remsStormActiveText.value = null
  }

  /** Dev: force-trigger a dust storm at the given level (1-5). */
  function triggerStorm(level: number): void {
    const L = Math.max(1, Math.min(5, Math.round(level)))
    storm = { ...storm, phase: 'incoming', timer: 22, level: L }
    const label = DUST_STORM_LEVEL_LABELS[L] ?? 'Moderate'
    remsStormIncomingText.value = `REMS: Level ${L} (${label}) dust storm approaching — expect high winds.`
    remsStormActiveText.value = null
  }

  function tickRemsWeather(input: RemsWeatherTickInput): void {
    const { terrain, remsOn, ambientEffectiveC, simulationTime, timeOfDay, sol, deltaSeconds } = input
    const dustCover = terrain?.dustCover ?? 0.45
    const stormSeed = terrain?.seed ?? 1
    const stormChance = 0.04 + dustCover * 0.14

    // --- Dust storm FSM (always ticks so storms persist across REMS toggle) ---
    const stormResult = tickStormFSM(storm, deltaSeconds, stormSeed, sol, stormChance)
    storm = stormResult.state
    if (stormResult.incomingText) remsStormIncomingText.value = stormResult.incomingText
    if (stormResult.activeText) {
      remsStormActiveText.value = stormResult.activeText
      remsStormIncomingText.value = null
    }
    // Clear active text when storm leaves active phase
    if (storm.phase !== 'active' && storm.phase !== 'incoming') {
      remsStormActiveText.value = null
    }
    if (storm.phase !== 'incoming') {
      // Only clear incoming if FSM didn't just set it this frame
      if (!stormResult.incomingText) remsStormIncomingText.value = null
    }

    // --- Always-live weather (world state, independent of REMS toggle) ---
    const w = computeSiteWeather(
      terrain, simulationTime, timeOfDay, sol, dustCover, ambientEffectiveC,
      storm, stormResult.affectsReadouts,
    )
    siteWeather.value = w

    // --- REMS display gating (HUD mirrors world state only when instrument is on) ---
    if (!remsOn) {
      wasRemsOn = false
      solClockAmbientC.value = null
      remsHud.value = emptyHud()
      return
    }

    if (!wasRemsOn) {
      wasRemsOn = true
      storm = { ...storm, idleCountdown: Math.max(storm.idleCountdown, 28) }
    }

    solClockAmbientC.value = ambientEffectiveC

    remsHud.value = {
      available: true,
      pressureHpa: w.pressureHpa,
      humidityPct: w.humidityPct,
      tempC: w.tempC,
      windMs: w.windMs,
      windDirDeg: w.windDirDeg,
      windDirCompass: windFromDegToCompass(w.windDirDeg),
      uvIndex: w.uvIndex,
      elevationKm: terrain?.elevationKm ?? 0,
      dustStormPhase: w.dustStormPhase,
      dustStormLevel: w.dustStormLevel,
    }
  }

  return {
    solClockAmbientC,
    remsHud,
    remsStormIncomingText,
    remsStormActiveText,
    /** Always-live weather — updates even when REMS display is off. */
    siteWeather,
    tickRemsWeather,
    /** Test hook: clear storm timers. */
    resetStormState,
    /** Dev: force-trigger a dust storm at the given level (1-5). */
    triggerStorm,
  }
}
