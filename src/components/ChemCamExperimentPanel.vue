<template>
  <Teleport to="body">
    <Transition name="panel-fade">
      <div v-if="readout" class="chemcam-panel" @click.self="emitClose">
        <div class="cp-card">
          <!-- Header -->
          <div class="cp-header">
            <div class="cp-header-left">
              <div class="cp-instrument">CHEMCAM LIBS</div>
              <div class="cp-sol">CAPTURED SOL <span class="font-instrument">{{ readout.capturedSol }}</span></div>
              <div class="cp-capture-utc">{{ captureUtcLabel }}</div>
            </div>
            <div class="cp-rock-label">{{ readout.rockLabel }}</div>
            <button type="button" class="cp-close" aria-label="Close" @click="emitClose">&times;</button>
          </div>

          <!-- Calibration bar -->
          <div class="cp-calibration">
            <span class="cp-cal-label">LIBS CALIBRATION</span>
            <div class="cp-cal-bar">
              <div class="cp-cal-fill" :style="{ width: calPct + '%' }" />
            </div>
            <span class="cp-cal-pct">{{ calPct }}%</span>
            <span v-if="calPct < 100" class="cp-cal-hint">{{ calHint }}</span>
          </div>

          <!-- Spectrum plot -->
          <div class="cp-plot-wrap">
            <svg class="cp-spectrum" viewBox="0 -28 600 228" preserveAspectRatio="none">
              <!-- Grid lines -->
              <line v-for="y in [50, 100, 150]" :key="'g'+y"
                x1="0" :y1="y" x2="600" :y2="y"
                stroke="rgba(102,255,238,0.08)" stroke-width="0.5" />
              <!-- X-axis wavelength ticks -->
              <template v-for="nm in [400, 450, 500, 550, 600, 650, 700]" :key="'t'+nm">
                <line :x1="nmToX(nm)" y1="195" :x2="nmToX(nm)" y2="200"
                  stroke="rgba(102,255,238,0.3)" stroke-width="0.5" />
                <text :x="nmToX(nm)" y="194" fill="rgba(102,255,238,0.3)"
                  font-size="10" text-anchor="middle" font-family="Datatype, sans-serif">{{ nm }}</text>
              </template>

              <!-- Baseline noise -->
              <path :d="baselinePath" fill="none" stroke="rgba(102,255,238,0.12)" stroke-width="0.5" />

              <!-- Spectrum curve -->
              <path :d="spectrumPath" fill="none" stroke="#66ffee" stroke-width="1.5"
                :stroke-dasharray="animatedDash" :stroke-dashoffset="animatedOffset" />

              <!-- Peak labels -->
              <template v-for="peak in readout.peaks" :key="peak.wavelength">
                <line v-if="peak.intensity > 0.4"
                  :x1="nmToX(peak.wavelength)" :y1="intensityToY(peak.intensity) - 4"
                  :x2="nmToX(peak.wavelength)" :y2="intensityToY(peak.intensity) - 14"
                  :stroke="peakColor(peak)" stroke-width="0.5" />
                <text v-if="peak.intensity > 0.4"
                  :x="nmToX(peak.wavelength)" :y="intensityToY(peak.intensity) - 16"
                  :fill="peakColor(peak)" font-size="11" font-weight="bold"
                  text-anchor="middle" font-family="IBM Plex Sans, sans-serif">{{ peak.element }}</text>
              </template>
            </svg>
            <div class="cp-axis-label">WAVELENGTH (nm)</div>
          </div>

          <!-- Element summary -->
          <div class="cp-elements">
            <span v-for="el in uniqueElements" :key="el.element" class="cp-element-tag"
              :style="{ borderColor: el.color }">
              {{ el.element }} <span class="cp-el-pct">{{ (el.maxIntensity * 100).toFixed(0) }}%</span>
            </span>
          </div>

          <!-- Science blurb -->
          <div class="cp-blurb">{{ scienceBlurb }}</div>

          <!-- Actions -->
          <div class="cp-actions">
            <button type="button" class="cp-btn-ack" @click="emitAcknowledge(readout.id)">ACKNOWLEDGE</button>
            <button class="cp-btn-transmit" disabled>TRANSMIT TO EARTH</button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, ref, watch, onMounted } from 'vue'
import { useUiSound } from '@/composables/useUiSound'
import type { ChemCamReadout } from '@/three/instruments/ChemCamController'
import type { SpectrumPeak } from '@/types/chemcam'

const props = defineProps<{
  readout: ChemCamReadout | null
}>()

const emit = defineEmits<{
  close: []
  acknowledge: [id: string]
  transmit: [id: string]
}>()

const { playUiCue } = useUiSound()

function emitClose(): void {
  playUiCue('ui.confirm')
  emit('close')
}

function emitAcknowledge(id: string): void {
  playUiCue('ui.confirm')
  emit('acknowledge', id)
}

/** ISO-style UTC time when LIBS acquisition finished. */
const captureUtcLabel = computed(() => {
  const r = props.readout
  if (!r) return ''
  try {
    const iso = new Date(r.timestamp).toISOString()
    return `${iso.slice(0, 10)} ${iso.slice(11, 19)} UTC`
  } catch {
    return ''
  }
})

// --- Spectrum layout ---
const NM_MIN = 380
const NM_MAX = 720
const PLOT_W = 600
const PLOT_H = 200
const MARGIN_TOP = 10
const PLOT_AREA_H = 170

function nmToX(nm: number): number {
  return ((nm - NM_MIN) / (NM_MAX - NM_MIN)) * PLOT_W
}

function intensityToY(intensity: number): number {
  return MARGIN_TOP + PLOT_AREA_H * (1 - intensity)
}

// --- Animated path drawing ---
const animatedDash = ref('2000')
const animatedOffset = ref('2000')

watch(() => props.readout, (newVal) => {
  if (newVal) {
    animatedOffset.value = '2000'
    requestAnimationFrame(() => {
      animatedOffset.value = '0'
    })
  }
})

// --- Spectrum path generation ---
const spectrumPath = computed(() => {
  if (!props.readout) return ''
  return buildSpectrumPath(props.readout.peaks)
})

const baselinePath = computed(() => {
  // Subtle noise baseline
  let d = ''
  for (let x = 0; x <= PLOT_W; x += 3) {
    const y = MARGIN_TOP + PLOT_AREA_H - (Math.sin(x * 0.1) * 2 + Math.cos(x * 0.23) * 1.5 + 5)
    d += (x === 0 ? 'M' : 'L') + `${x},${y}`
  }
  return d
})

function buildSpectrumPath(peaks: SpectrumPeak[]): string {
  // Generate continuous spectrum from peaks using gaussian contributions
  const points: { x: number; y: number }[] = []
  const step = 2 // nm

  for (let nm = NM_MIN; nm <= NM_MAX; nm += step) {
    let intensity = 0.03 + Math.sin(nm * 0.05) * 0.01 // baseline noise

    for (const peak of peaks) {
      const dist = nm - peak.wavelength
      const sigma = 4 + Math.random() * 0.5 // narrow peaks
      intensity += peak.intensity * Math.exp(-(dist * dist) / (2 * sigma * sigma))
    }

    intensity = Math.min(1, intensity)
    points.push({ x: nmToX(nm), y: intensityToY(intensity) })
  }

  let d = `M${points[0].x},${points[0].y}`
  for (let i = 1; i < points.length; i++) {
    d += `L${points[i].x},${points[i].y}`
  }
  return d
}

// --- Peak colors ---
const ELEMENT_COLORS: Record<string, string> = {
  Fe: '#ff8833',
  Si: '#cc44ff',
  Mn: '#ff44aa',
  Mg: '#44ff88',
  Al: '#4488ff',
  Ca: '#ffcc44',
  Na: '#ffaa22',
  Ti: '#88aaff',
  S:  '#ffff44',
  Ni: '#44ffcc',
}

function peakColor(peak: SpectrumPeak): string {
  return ELEMENT_COLORS[peak.element] ?? '#66ffee'
}

// --- Unique elements with max intensity ---
const uniqueElements = computed(() => {
  if (!props.readout) return []
  const map = new Map<string, { element: string; maxIntensity: number; color: string }>()
  for (const p of props.readout.peaks) {
    const existing = map.get(p.element)
    if (!existing || p.intensity > existing.maxIntensity) {
      map.set(p.element, {
        element: p.element,
        maxIntensity: p.intensity,
        color: ELEMENT_COLORS[p.element] ?? '#66ffee',
      })
    }
  }
  return Array.from(map.values()).sort((a, b) => b.maxIntensity - a.maxIntensity)
})

// --- Calibration ---
const calPct = computed(() => {
  if (!props.readout) return 0
  return Math.round(props.readout.calibration * 100)
})

const calHint = computed(() => {
  const c = props.readout?.calibration ?? 0
  if (c < 0.2) return 'Spectrometer uncalibrated — most peaks unresolved'
  if (c < 0.4) return 'Partial calibration — some elements identifiable'
  if (c < 0.7) return 'Improving resolution — minor peaks still noisy'
  if (c < 1.0) return 'Near full calibration — trace elements emerging'
  return ''
})

// --- Science blurb (degrades with low calibration) ---
const BLURBS: Record<string, string> = {
  basalt: 'Si and Fe emission consistent with tholeiitic basalt. Mg presence suggests mafic composition.',
  hematite: 'Strong Fe emission with Mn enrichment. Oxidizing conditions — possible aqueous alteration history.',
  olivine: 'Mg-Fe silicate signature. Olivine crystallized from mafic melt — minimal weathering detected.',
  sulfate: 'S and Ca dominant. Evaporite mineral — indicates past standing water that concentrated dissolved salts.',
  mudstone: 'Mixed Si-Fe-Al-Mn spectrum. Fine-grained sediment — lacustrine origin. Mn enrichment suggests strongly oxidizing conditions.',
  'iron-meteorite': 'Fe-Ni alloy signature. Extraterrestrial origin confirmed — kamacite/taenite lattice probable.',
}

const LOW_CAL_BLURBS = [
  'Signal-to-noise ratio too low for conclusive analysis. Continue calibrating spectrometer.',
  'Partial spectrum acquired. Dominant emission lines detected but element assignment uncertain.',
  'Spectrometer warming up. Strongest peaks suggest metallic content — further data needed.',
]

const scienceBlurb = computed(() => {
  if (!props.readout) return ''
  const cal = props.readout.calibration
  if (cal < 0.3) return LOW_CAL_BLURBS[Math.floor(Math.random() * 3)] ?? LOW_CAL_BLURBS[0]
  if (cal < 0.6) return 'Preliminary analysis: ' + (BLURBS[props.readout.rockType]?.split('.')[0] ?? 'Composition uncertain') + '. Confidence limited — calibrate further.'
  return BLURBS[props.readout.rockType] ?? 'Spectrum acquired. Elemental composition logged for SAM cross-reference.'
})
</script>

<style scoped>
.chemcam-panel {
  position: fixed;
  inset: 0;
  z-index: 60;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(4px);
}

.cp-card {
  width: 640px;
  max-width: 90vw;
  background: rgba(8, 4, 2, 0.95);
  border: 1px solid rgba(102, 255, 238, 0.25);
  border-radius: 10px;
  padding: 20px;
  font-family: var(--font-ui);
}

/* Calibration bar */
.cp-calibration {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
  padding: 6px 10px;
  background: rgba(0, 0, 0, 0.4);
  border-radius: 6px;
  border: 1px solid rgba(102, 255, 238, 0.08);
}

.cp-cal-label {
  font-size: 11px;
  color: rgba(102, 255, 238, 0.4);
  letter-spacing: 0.12em;
  flex-shrink: 0;
}

.cp-cal-bar {
  flex: 1;
  height: 4px;
  background: rgba(102, 255, 238, 0.08);
  border-radius: 2px;
  overflow: hidden;
}

.cp-cal-fill {
  height: 100%;
  background: linear-gradient(90deg, rgba(102, 255, 238, 0.3), #66ffee);
  border-radius: 2px;
  transition: width 0.3s ease;
}

.cp-cal-pct {
  font-family: var(--font-instrument);
  font-size: 12px;
  color: #66ffee;
  font-weight: bold;
  font-variant-numeric: tabular-nums;
  min-width: 32px;
  text-align: right;
}

.cp-cal-hint {
  font-size: 11px;
  color: rgba(102, 255, 238, 0.35);
  letter-spacing: 0.04em;
  flex-shrink: 0;
}

/* Header */
.cp-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid rgba(102, 255, 238, 0.12);
}

.cp-header-left {
  display: flex;
  flex-direction: column;
  gap: 3px;
  align-items: flex-start;
}

.cp-instrument {
  font-size: 12px;
  color: rgba(102, 255, 238, 0.5);
  letter-spacing: 0.15em;
}

.cp-sol {
  font-size: 11px;
  color: rgba(102, 255, 238, 0.55);
  letter-spacing: 0.12em;
  font-weight: bold;
}

.cp-capture-utc {
  font-family: var(--font-instrument);
  font-size: 11px;
  color: rgba(102, 255, 238, 0.35);
  letter-spacing: 0.06em;
  font-variant-numeric: tabular-nums;
}

.cp-rock-label {
  margin-left: auto;
  font-size: 16px;
  color: #66ffee;
  font-weight: bold;
  letter-spacing: 0.12em;
}

.cp-close {
  background: none;
  border: none;
  color: rgba(102, 255, 238, 0.4);
  font-size: 20px;
  cursor: pointer;
  padding: 0 4px;
  line-height: 1;
}

.cp-close:hover {
  color: #66ffee;
}

/* Spectrum plot */
.cp-plot-wrap {
  position: relative;
  background: rgba(0, 0, 0, 0.5);
  border: 1px solid rgba(102, 255, 238, 0.1);
  border-radius: 6px;
  padding: 8px;
  margin-bottom: 12px;
}

.cp-spectrum {
  width: 100%;
  height: 200px;
}

.cp-spectrum path {
  transition: stroke-dashoffset 0.8s ease-out;
}

.cp-axis-label {
  position: absolute;
  bottom: 2px;
  right: 12px;
  font-size: 12px;
  color: rgba(102, 255, 238, 0.25);
  letter-spacing: 0.1em;
}

/* Element tags */
.cp-elements {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 12px;
}

.cp-element-tag {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  background: rgba(0, 0, 0, 0.4);
  border: 1px solid;
  border-radius: 4px;
  font-size: 12px;
  font-weight: bold;
  color: rgba(232, 200, 160, 0.8);
  letter-spacing: 0.08em;
}

.cp-el-pct {
  font-family: var(--font-instrument);
  font-size: 11px;
  color: rgba(232, 200, 160, 0.4);
  font-weight: normal;
  font-variant-numeric: tabular-nums;
}

/* Science blurb */
.cp-blurb {
  font-size: 12px;
  color: rgba(102, 255, 238, 0.5);
  line-height: 1.6;
  letter-spacing: 0.04em;
  margin-bottom: 16px;
  padding: 8px 10px;
  background: rgba(102, 255, 238, 0.04);
  border-radius: 6px;
  border-left: 2px solid rgba(102, 255, 238, 0.2);
}

/* Actions */
.cp-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.cp-btn-ack {
  padding: 10px 24px;
  background: rgba(102, 255, 238, 0.12);
  border: 1px solid rgba(102, 255, 238, 0.4);
  border-radius: 6px;
  color: #66ffee;
  font-family: var(--font-ui);
  font-size: 11px;
  font-weight: bold;
  letter-spacing: 0.2em;
  cursor: pointer;
  transition: all 0.15s;
}

.cp-btn-ack:hover {
  background: rgba(102, 255, 238, 0.2);
  border-color: rgba(102, 255, 238, 0.6);
}

.cp-btn-transmit {
  padding: 10px 24px;
  background: rgba(102, 255, 238, 0.04);
  border: 1px solid rgba(102, 255, 238, 0.15);
  border-radius: 6px;
  color: rgba(102, 255, 238, 0.3);
  font-family: var(--font-ui);
  font-size: 11px;
  font-weight: bold;
  letter-spacing: 0.2em;
  cursor: not-allowed;
  opacity: 0.5;
}

/* Transition */
.panel-fade-enter-active,
.panel-fade-leave-active {
  transition: opacity 0.25s ease;
}

.panel-fade-enter-from,
.panel-fade-leave-to {
  opacity: 0;
}
</style>
