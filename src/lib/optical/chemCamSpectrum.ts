/**
 * Procedural ChemCam LIBS-style optical spectrum (element peaks vs calibration).
 * Pure math — RNG is injectable for tests (`Math.random` by default).
 */

import type { RockTypeId } from '@/lib/terrain/rocks'
import type { SpectrumPeak } from '@/types/chemcam'

/** Element templates — wavelength ranges where peaks appear. */
export const CHEM_CAM_ELEMENT_PEAKS: Record<string, { nm: number; spread: number }[]> = {
  Fe: [{ nm: 404, spread: 3 }, { nm: 438, spread: 4 }, { nm: 527, spread: 3 }],
  Si: [{ nm: 390, spread: 5 }, { nm: 634, spread: 4 }],
  Mn: [{ nm: 403, spread: 3 }, { nm: 475, spread: 4 }],
  Mg: [{ nm: 518, spread: 5 }, { nm: 552, spread: 3 }],
  Al: [{ nm: 396, spread: 4 }, { nm: 394, spread: 3 }],
  Ca: [{ nm: 422, spread: 4 }, { nm: 445, spread: 3 }],
  Na: [{ nm: 589, spread: 2 }, { nm: 590, spread: 2 }],
  Ti: [{ nm: 498, spread: 4 }, { nm: 506, spread: 3 }],
  S: [{ nm: 545, spread: 5 }, { nm: 564, spread: 4 }],
  Ni: [{ nm: 508, spread: 3 }, { nm: 471, spread: 4 }],
}

/** Dominant elements per rock type (LIBS-style relative weights). */
export const CHEM_CAM_ROCK_ELEMENT_PROFILES: Record<RockTypeId, { el: string; weight: number }[]> = {
  basalt: [
    { el: 'Fe', weight: 0.7 }, { el: 'Si', weight: 0.9 },
    { el: 'Mg', weight: 0.6 }, { el: 'Ca', weight: 0.5 },
    { el: 'Al', weight: 0.4 }, { el: 'Ti', weight: 0.3 },
  ],
  hematite: [
    { el: 'Fe', weight: 1.0 }, { el: 'Si', weight: 0.3 },
    { el: 'Mn', weight: 0.4 }, { el: 'Al', weight: 0.2 },
  ],
  olivine: [
    { el: 'Mg', weight: 0.9 }, { el: 'Fe', weight: 0.6 },
    { el: 'Si', weight: 0.8 }, { el: 'Mn', weight: 0.2 },
  ],
  sulfate: [
    { el: 'S', weight: 0.9 }, { el: 'Ca', weight: 0.7 },
    { el: 'Mg', weight: 0.5 }, { el: 'Fe', weight: 0.2 },
    { el: 'Na', weight: 0.3 },
  ],
  mudstone: [
    { el: 'Si', weight: 0.7 }, { el: 'Fe', weight: 0.5 },
    { el: 'Al', weight: 0.6 }, { el: 'Ca', weight: 0.4 },
    { el: 'Mn', weight: 0.5 },
  ],
  'iron-meteorite': [
    { el: 'Fe', weight: 1.0 }, { el: 'Ni', weight: 0.8 },
    { el: 'Mn', weight: 0.3 }, { el: 'Si', weight: 0.1 },
  ],
}

/**
 * Generate spectrum peaks with quality driven by calibration (0–1).
 *
 * @param random - Unit uniform sampler; default `Math.random` (gameplay).
 */
export function generateChemCamSpectrum(
  rockType: RockTypeId,
  cal: number,
  random: () => number = Math.random,
): SpectrumPeak[] {
  const profile = CHEM_CAM_ROCK_ELEMENT_PROFILES[rockType] ?? CHEM_CAM_ROCK_ELEMENT_PROFILES.basalt
  const allPeaks: { nm: number; intensity: number; element: string; weight: number }[] = []

  for (const { el, weight } of profile) {
    const templates = CHEM_CAM_ELEMENT_PEAKS[el]
    if (!templates) continue
    for (const t of templates) {
      const nm = t.nm + (random() - 0.5) * t.spread
      const intensity = weight * (0.7 + random() * 0.3)
      allPeaks.push({ nm, intensity, element: el, weight })
    }
  }

  allPeaks.sort((a, b) => b.weight - a.weight)

  const visibleFraction = 0.2 + cal * 0.8
  const visibleCount = Math.max(1, Math.ceil(allPeaks.length * visibleFraction))

  const labelThreshold = 1.0 - cal
  const noiseMag = (1 - cal) * 0.25

  const peaks: SpectrumPeak[] = []
  for (let i = 0; i < allPeaks.length; i++) {
    const p = allPeaks[i]
    if (i >= visibleCount) continue

    const noise = (random() - 0.5) * 2 * noiseMag
    const noisyIntensity = Math.max(0.05, Math.min(1, p.intensity + noise))

    const extraJitter = (1 - cal) * 8
    const jitteredNm = p.nm + (random() - 0.5) * extraJitter

    const labeled = p.weight >= labelThreshold
    const element = labeled ? p.element : '??'

    peaks.push({
      wavelength: Math.round(jitteredNm * 10) / 10,
      intensity: noisyIntensity,
      element,
    })
  }

  peaks.sort((a, b) => a.wavelength - b.wavelength)
  return peaks
}
