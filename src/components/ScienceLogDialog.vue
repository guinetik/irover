<template>
  <Teleport to="body">
    <Transition name="science-fade">
      <div v-if="open" class="science-overlay" @click.self="$emit('close')">
        <div class="science-dialog" role="dialog" aria-labelledby="science-dialog-title">
          <div class="science-head">
            <h2 id="science-dialog-title" class="science-title">SCIENCE LOG</h2>
            <button type="button" class="science-close" aria-label="Close" @click="$emit('close')">&times;</button>
          </div>
          <div class="science-panes">
            <nav class="science-cats" aria-label="Categories">
              <div v-if="spectra.length === 0 && danProspects.length === 0" class="science-empty-side">No discoveries yet.</div>
              <div v-if="spectra.length > 0" class="science-accordion">
                <button
                  type="button"
                  class="science-acc-head"
                  :aria-expanded="chemcamExpanded"
                  aria-controls="science-chemcam-list"
                  id="science-chemcam-trigger"
                  @click="chemcamExpanded = !chemcamExpanded"
                >
                  <span class="science-acc-chev" aria-hidden="true">{{ chemcamExpanded ? '▼' : '▶' }}</span>
                  <span class="science-acc-label">CHEMCAM</span>
                  <span class="science-acc-badge font-instrument">{{ spectra.length }}</span>
                </button>
                <ul
                  v-show="chemcamExpanded"
                  id="science-chemcam-list"
                  class="science-acc-list"
                  role="list"
                  aria-labelledby="science-chemcam-trigger"
                >
                  <li v-for="s in sortedSpectra" :key="s.archiveId">
                    <button
                      type="button"
                      class="science-acc-item"
                      :class="{ active: s.archiveId === selectedId }"
                      @click="selectedId = s.archiveId"
                    >
                      <span class="sai-rock">{{ s.rockLabel }}</span>
                      <span class="sai-meta font-instrument">SOL {{ s.capturedSol }} · {{ formatShortDate(s.capturedAtMs) }}</span>
                    </button>
                  </li>
                </ul>
              </div>
              <!-- DAN accordion -->
              <div v-if="danProspects.length > 0" class="science-accordion science-accordion-dan">
                <button
                  type="button"
                  class="science-acc-head science-acc-head-dan"
                  :aria-expanded="danExpanded"
                  aria-controls="science-dan-list"
                  id="science-dan-trigger"
                  @click="danExpanded = !danExpanded"
                >
                  <span class="science-acc-chev" aria-hidden="true">{{ danExpanded ? '▼' : '▶' }}</span>
                  <span class="science-acc-label">DAN</span>
                  <span class="science-acc-badge science-acc-badge-dan font-instrument">{{ danProspects.length }}</span>
                </button>
                <ul
                  v-show="danExpanded"
                  id="science-dan-list"
                  class="science-acc-list"
                  role="list"
                  aria-labelledby="science-dan-trigger"
                >
                  <li v-for="p in sortedDanProspects" :key="p.archiveId">
                    <button
                      type="button"
                      class="science-acc-item"
                      :class="{ active: p.archiveId === selectedDanId }"
                      @click="selectedDanId = p.archiveId"
                    >
                      <span class="sai-rock">{{ p.quality }} Signal{{ p.waterConfirmed ? ' — WATER' : '' }}</span>
                      <span class="sai-meta font-instrument">SOL {{ p.capturedSol }} · {{ formatShortDate(p.capturedAtMs) }}</span>
                    </button>
                  </li>
                </ul>
              </div>
            </nav>
            <div class="science-detail">
              <div v-if="spectra.length === 0 && danProspects.length === 0" class="science-empty">No archived data.</div>
              <!-- ChemCam detail -->
              <template v-if="detailMode === 'chemcam'">
                <div v-if="!selected" class="science-detail-hint">Select a spectrum in the list.</div>
                <div v-else class="science-record-body">
                    <div class="science-plot-wrap">
                      <!-- Extra top viewBox padding so peak labels (e.g. Ti) are not clipped -->
                      <svg class="science-spectrum" viewBox="0 -28 600 228" preserveAspectRatio="none">
                        <line v-for="y in [50, 100, 150]" :key="'g' + y"
                          x1="0" :y1="y" x2="600" :y2="y"
                          stroke="rgba(102,255,238,0.08)" stroke-width="0.5" />
                        <template v-for="nm in [400, 450, 500, 550, 600, 650, 700]" :key="'t' + nm">
                          <line :x1="nmToX(nm)" y1="195" :x2="nmToX(nm)" y2="200"
                            stroke="rgba(102,255,238,0.25)" stroke-width="0.5" />
                          <text :x="nmToX(nm)" y="194" fill="rgba(102,255,238,0.25)"
                            font-size="10" text-anchor="middle" font-family="Datatype, sans-serif">{{ nm }}</text>
                        </template>
                        <path :d="baselinePath" fill="none" stroke="rgba(102,255,238,0.1)" stroke-width="0.5" />
                        <path :d="spectrumPath" fill="none" stroke="#66ffee" stroke-width="1.5" />
                        <template v-for="peak in selected.peaks" :key="peak.wavelength + peak.element">
                          <g v-if="peak.intensity > 0.35">
                            <line
                              :x1="nmToX(peak.wavelength)" :y1="intensityToY(peak.intensity) - 4"
                              :x2="nmToX(peak.wavelength)" :y2="intensityToY(peak.intensity) - 14"
                              :stroke="peakColor(peak)" stroke-width="0.5" />
                            <text
                              :x="nmToX(peak.wavelength)" :y="intensityToY(peak.intensity) - 16"
                              :fill="peakColor(peak)" font-size="11" font-weight="bold"
                              text-anchor="middle" font-family="IBM Plex Sans, sans-serif"
                            >{{ peak.element }}</text>
                          </g>
                        </template>
                      </svg>
                      <div class="science-axis">WAVELENGTH (nm)</div>
                    </div>
                    <dl class="science-meta">
                      <div class="sm-row"><dt>Rock</dt><dd>{{ selected.rockLabel }}</dd></div>
                      <div class="sm-row"><dt>Type</dt><dd>{{ selected.rockType }}</dd></div>
                      <div class="sm-row"><dt>Site</dt><dd>{{ selected.siteId }}</dd></div>
                      <div class="sm-row"><dt>Lat / Lon</dt><dd class="sm-instr">{{ formatLatLon(selected.latitudeDeg, selected.longitudeDeg) }}</dd></div>
                      <div class="sm-row"><dt>Captured</dt><dd class="sm-instr">SOL {{ selected.capturedSol }} · {{ formatUtc(selected.capturedAtMs) }}</dd></div>
                      <div class="sm-row"><dt>Acknowledged</dt><dd class="sm-instr">SOL {{ selected.solAcknowledged }} · {{ formatUtc(selected.acknowledgedAtMs) }}</dd></div>
                      <div class="sm-row"><dt>Calibration</dt><dd class="sm-instr">{{ Math.round(selected.calibration * 100) }}%</dd></div>
                      <div class="sm-row"><dt>Transmitted</dt><dd class="sm-instr">{{ selected.transmitted ? 'YES' : 'NO' }}</dd></div>
                    </dl>
                </div>
              </template>
              <!-- DAN detail -->
              <template v-if="detailMode === 'dan'">
                <div v-if="!selectedDan" class="science-detail-hint">Select a prospect in the list.</div>
                <div v-else class="science-record-body science-dan-detail">
                  <div class="dan-detail-graphic">
                    <div class="dan-detail-placeholder">
                      <div class="dan-detail-icon">&#x2261;</div>
                      <div class="dan-detail-text">NEUTRON MAP</div>
                      <div class="dan-detail-sub">Traverse visualization pending</div>
                    </div>
                  </div>
                  <dl class="science-meta">
                    <div class="sm-row"><dt>Quality</dt><dd :style="{ color: danQualityColor }">{{ selectedDan.quality }}</dd></div>
                    <div class="sm-row"><dt>Signal</dt><dd class="sm-instr">{{ Math.round(selectedDan.signalStrength * 100) }}%</dd></div>
                    <div class="sm-row"><dt>Water</dt><dd :style="{ color: selectedDan.waterConfirmed ? '#44aaff' : '#886a50' }">{{ selectedDan.waterConfirmed ? 'CONFIRMED' : 'INCONCLUSIVE' }}</dd></div>
                    <div class="sm-row"><dt>Reservoir</dt><dd class="sm-instr">{{ Math.round(selectedDan.reservoirQuality * 100) }}%</dd></div>
                    <div class="sm-row"><dt>Site</dt><dd>{{ selectedDan.siteId }}</dd></div>
                    <div class="sm-row"><dt>Lat / Lon</dt><dd class="sm-instr">{{ formatLatLon(selectedDan.latitudeDeg, selectedDan.longitudeDeg) }}</dd></div>
                    <div class="sm-row"><dt>Captured</dt><dd class="sm-instr">SOL {{ selectedDan.capturedSol }} · {{ formatUtc(selectedDan.capturedAtMs) }}</dd></div>
                    <div class="sm-row"><dt>Transmitted</dt><dd class="sm-instr">{{ selectedDan.transmitted ? 'YES' : 'NO' }}</dd></div>
                  </dl>
                </div>
              </template>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import type { ArchivedChemCamSpectrum } from '@/types/chemcamArchive'
import type { SpectrumPeak } from '@/three/instruments/ChemCamController'
import type { ArchivedDANProspect } from '@/types/danArchive'

const props = defineProps<{
  open: boolean
  spectra: ArchivedChemCamSpectrum[]
  danProspects: ArchivedDANProspect[]
}>()

defineEmits<{
  close: []
}>()

const chemcamExpanded = ref(true)
const selectedId = ref<string | null>(null)

const danExpanded = ref(true)
const selectedDanId = ref<string | null>(null)

const detailMode = ref<'chemcam' | 'dan'>('chemcam')

watch(selectedDanId, (id) => {
  if (id) detailMode.value = 'dan'
})
watch(selectedId, (id) => {
  if (id) detailMode.value = 'chemcam'
})

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen && props.spectra.length > 0) chemcamExpanded.value = true
  },
)

const sortedSpectra = computed(() =>
  [...props.spectra].sort((a, b) => b.capturedAtMs - a.capturedAtMs),
)

const selected = computed(() =>
  sortedSpectra.value.find((s) => s.archiveId === selectedId.value) ?? null,
)

const sortedDanProspects = computed(() =>
  [...props.danProspects].sort((a, b) => b.capturedAtMs - a.capturedAtMs),
)

const selectedDan = computed(() =>
  sortedDanProspects.value.find((s) => s.archiveId === selectedDanId.value) ?? null,
)

const danQualityColor = computed(() => {
  if (!selectedDan.value) return '#888'
  if (selectedDan.value.quality === 'Strong') return '#44aaff'
  if (selectedDan.value.quality === 'Moderate') return '#66ccff'
  return '#88aacc'
})

watch(
  () => [props.open, props.spectra] as const,
  ([isOpen, list]) => {
    if (!isOpen || list.length === 0) return
    if (!selectedId.value || !list.some((s) => s.archiveId === selectedId.value)) {
      const sorted = [...list].sort((a, b) => b.capturedAtMs - a.capturedAtMs)
      selectedId.value = sorted[0]?.archiveId ?? null
    }
  },
  { immediate: true },
)

const NM_MIN = 380
const NM_MAX = 720
const PLOT_W = 600
const MARGIN_TOP = 10
const PLOT_AREA_H = 170

function nmToX(nm: number): number {
  return ((nm - NM_MIN) / (NM_MAX - NM_MIN)) * PLOT_W
}

function intensityToY(intensity: number): number {
  return MARGIN_TOP + PLOT_AREA_H * (1 - intensity)
}

const baselinePath = computed(() => {
  let d = ''
  for (let x = 0; x <= PLOT_W; x += 3) {
    const y = MARGIN_TOP + PLOT_AREA_H - (Math.sin(x * 0.1) * 2 + Math.cos(x * 0.23) * 1.5 + 5)
    d += (x === 0 ? 'M' : 'L') + `${x},${y}`
  }
  return d
})

/** Deterministic curve from stored peaks (no random — matches archive replay). */
const spectrumPath = computed(() => {
  if (!selected.value) return ''
  const peaks = selected.value.peaks
  const points: { x: number; y: number }[] = []
  const step = 2
  for (let nm = NM_MIN; nm <= NM_MAX; nm += step) {
    let intensity = 0.03 + Math.sin(nm * 0.05) * 0.01
    for (const peak of peaks) {
      const dist = nm - peak.wavelength
      const sigma = 4
      intensity += peak.intensity * Math.exp(-(dist * dist) / (2 * sigma * sigma))
    }
    intensity = Math.min(1, intensity)
    points.push({ x: nmToX(nm), y: intensityToY(intensity) })
  }
  if (points.length === 0) return ''
  let d = `M${points[0].x},${points[0].y}`
  for (let i = 1; i < points.length; i++) {
    d += `L${points[i].x},${points[i].y}`
  }
  return d
})

const ELEMENT_COLORS: Record<string, string> = {
  Fe: '#ff8833',
  Si: '#cc44ff',
  Mn: '#ff44aa',
  Mg: '#44ff88',
  Al: '#4488ff',
  Ca: '#ffcc44',
  Na: '#ffaa22',
  Ti: '#88aaff',
  S: '#ffff44',
  Ni: '#44ffcc',
}

function peakColor(peak: SpectrumPeak): string {
  return ELEMENT_COLORS[peak.element] ?? '#66ffee'
}

function formatUtc(ms: number): string {
  try {
    const iso = new Date(ms).toISOString()
    return `${iso.slice(0, 10)} ${iso.slice(11, 19)} UTC`
  } catch {
    return '—'
  }
}

function formatShortDate(ms: number): string {
  try {
    return new Date(ms).toISOString().slice(0, 10)
  } catch {
    return '—'
  }
}

function formatLatLon(lat: number, lon: number): string {
  const ns = lat >= 0 ? 'N' : 'S'
  const ew = lon >= 0 ? 'E' : 'W'
  return `${Math.abs(lat).toFixed(4)}°${ns} ${Math.abs(lon).toFixed(4)}°${ew}`
}
</script>

<style scoped>
.science-overlay {
  position: fixed;
  inset: 0;
  z-index: 200;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(0, 0, 0, 0.65);
  backdrop-filter: blur(6px);
}

.science-dialog {
  width: min(1040px, 100%);
  max-height: min(94vh, 920px);
  display: flex;
  flex-direction: column;
  background: rgba(10, 6, 4, 0.96);
  border: 1px solid rgba(196, 117, 58, 0.35);
  border-radius: 10px;
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.55);
  overflow: hidden;
  /* Teal-tinted scrollbars for accordion + detail (inherits to scrollable children; Firefox + WebKit) */
  --scrollbar-track: rgba(4, 14, 12, 0.9);
  --scrollbar-thumb: rgba(102, 255, 238, 0.22);
  --scrollbar-thumb-hover: rgba(102, 255, 238, 0.42);
  scrollbar-color: var(--scrollbar-thumb) var(--scrollbar-track);
}

.science-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid rgba(102, 255, 238, 0.15);
}

.science-title {
  margin: 0;
  font-family: var(--font-ui);
  font-size: 14px;
  font-weight: bold;
  letter-spacing: 0.2em;
  color: #66ffee;
}

.science-close {
  background: none;
  border: none;
  color: rgba(102, 255, 238, 0.45);
  font-size: 22px;
  line-height: 1;
  cursor: pointer;
  padding: 0 6px;
}
.science-close:hover {
  color: #66ffee;
}

.science-panes {
  display: flex;
  flex: 1;
  min-height: 0;
}

.science-cats {
  width: min(280px, 34vw);
  flex-shrink: 0;
  padding: 12px;
  border-right: 1px solid rgba(102, 255, 238, 0.12);
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 0;
}

.science-empty-side {
  font-family: var(--font-ui);
  font-size: 12px;
  color: rgba(196, 117, 58, 0.55);
  letter-spacing: 0.08em;
  padding: 8px 4px;
}

.science-accordion {
  display: flex;
  flex-direction: column;
  min-height: 0;
  border: 1px solid rgba(102, 255, 238, 0.15);
  border-radius: 8px;
  background: rgba(0, 0, 0, 0.25);
  overflow: hidden;
}

.science-acc-head {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 10px 10px 10px 8px;
  text-align: left;
  font-family: var(--font-ui);
  font-size: 12px;
  font-weight: bold;
  letter-spacing: 0.12em;
  color: #66ffee;
  background: rgba(102, 255, 238, 0.08);
  border: none;
  cursor: pointer;
  transition: background 0.15s;
}

.science-acc-head:hover {
  background: rgba(102, 255, 238, 0.14);
}

.science-acc-chev {
  flex-shrink: 0;
  width: 1rem;
  font-size: 11px;
  color: rgba(102, 255, 238, 0.65);
  text-align: center;
}

.science-acc-label {
  flex: 1;
}

.science-acc-badge {
  min-width: 1.5rem;
  text-align: center;
  padding: 2px 7px;
  border-radius: 8px;
  font-size: 11px;
  color: #0a0604;
  background: rgba(102, 255, 238, 0.75);
}

.science-acc-list {
  list-style: none;
  margin: 0;
  padding: 4px 4px 8px;
  max-height: min(52vh, 400px);
  overflow-y: auto;
  border-top: 1px solid rgba(102, 255, 238, 0.1);
}

.science-acc-item {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  width: 100%;
  padding: 8px 8px 8px 22px;
  margin-bottom: 4px;
  text-align: left;
  font-family: var(--font-ui);
  background: rgba(0, 0, 0, 0.2);
  border: 1px solid transparent;
  border-radius: 6px;
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s;
}

.science-acc-item:hover {
  border-color: rgba(102, 255, 238, 0.2);
  background: rgba(102, 255, 238, 0.04);
}

.science-acc-item.active {
  border-color: rgba(102, 255, 238, 0.55);
  background: rgba(102, 255, 238, 0.1);
}

.sai-rock {
  font-size: 12px;
  font-weight: bold;
  color: #e8f8f6;
  letter-spacing: 0.05em;
  line-height: 1.25;
}

.sai-meta {
  font-size: 12px;
  color: rgba(102, 255, 238, 0.45);
  letter-spacing: 0.04em;
}

.science-detail {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: 12px 16px 16px;
  overflow: hidden;
}

.science-empty {
  color: rgba(196, 117, 58, 0.5);
  font-family: var(--font-ui);
  font-size: 11px;
  letter-spacing: 0.08em;
  padding: 24px;
}

.science-detail-hint {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: var(--font-ui);
  font-size: 11px;
  letter-spacing: 0.1em;
  color: rgba(102, 255, 238, 0.35);
  padding: 32px;
  text-align: center;
}

.science-record-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 14px;
  overflow-y: auto;
}

/* Match ChemCamExperimentPanel `.cp-plot-wrap` + `.cp-spectrum` (600×200 viewBox → 200px tall) */
.science-plot-wrap {
  position: relative;
  width: 100%;
  flex-shrink: 0;
  padding: 8px;
  margin-bottom: 2px;
  background: rgba(0, 0, 0, 0.5);
  border: 1px solid rgba(102, 255, 238, 0.1);
  border-radius: 6px;
  box-sizing: border-box;
}

.science-spectrum {
  width: 100%;
  height: 200px;
  display: block;
}

.science-axis {
  position: absolute;
  bottom: 2px;
  right: 12px;
  font-size: 12px;
  letter-spacing: 0.1em;
  color: rgba(102, 255, 238, 0.25);
  font-family: var(--font-ui);
  pointer-events: none;
}

.science-meta {
  margin: 0;
  display: grid;
  grid-template-columns: 1fr;
  gap: 6px 16px;
  font-family: var(--font-ui);
  font-size: 12px;
}

@media (min-width: 640px) {
  .science-meta {
    grid-template-columns: 1fr 1fr;
  }
}

.sm-row {
  display: grid;
  grid-template-columns: 110px 1fr;
  gap: 8px;
  align-items: baseline;
}

.sm-row dt {
  margin: 0;
  color: rgba(196, 117, 58, 0.65);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  font-size: 11px;
}

.sm-row dd {
  margin: 0;
  color: rgba(232, 220, 200, 0.92);
  letter-spacing: 0.04em;
  word-break: break-word;
}

.sm-instr {
  font-family: var(--font-instrument);
  font-variant-numeric: tabular-nums;
}

.science-acc-head-dan {
  color: #44aaff;
  background: rgba(68, 170, 255, 0.08);
}
.science-acc-head-dan:hover {
  background: rgba(68, 170, 255, 0.14);
}
.science-acc-badge-dan {
  background: rgba(68, 170, 255, 0.75);
}
.science-accordion-dan {
  border-color: rgba(68, 170, 255, 0.15);
}
.science-accordion-dan .science-acc-chev {
  color: rgba(68, 170, 255, 0.65);
}

.dan-detail-graphic {
  width: 100%;
  padding: 16px;
  margin-bottom: 8px;
  background: rgba(5, 10, 25, 0.6);
  border: 1px solid rgba(68, 170, 255, 0.1);
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 140px;
}
.dan-detail-placeholder {
  text-align: center;
  color: rgba(68, 170, 255, 0.3);
}
.dan-detail-icon { font-size: 28px; margin-bottom: 6px; }
.dan-detail-text { font-size: 11px; font-weight: 600; letter-spacing: 0.1em; }
.dan-detail-sub { font-size: 10px; margin-top: 4px; opacity: 0.6; }

.science-fade-enter-active,
.science-fade-leave-active {
  transition: opacity 0.2s ease;
}
.science-fade-enter-active .science-dialog,
.science-fade-leave-active .science-dialog {
  transition: transform 0.2s ease, opacity 0.2s ease;
}
.science-fade-enter-from,
.science-fade-leave-to {
  opacity: 0;
}
.science-fade-enter-from .science-dialog,
.science-fade-leave-to .science-dialog {
  opacity: 0;
  transform: scale(0.98) translateY(8px);
}
</style>
