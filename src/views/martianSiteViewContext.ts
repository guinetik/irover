import type { Ref } from 'vue'
import { generateComposition, type APXSComposition } from '@/lib/apxsComposition'
import type { MarsSiteViewContext } from '@/views/MarsSiteViewController'
import type { APXSCountdownState } from '@/views/site-controllers/APXSHudController'

/**
 * Inputs for {@link buildMarsSiteViewContext}: same surface as {@link MarsSiteViewContext}, except APXS
 * minigame launch is described by composition weights + refs instead of inline callbacks.
 */
export type MartianSiteViewContextDeps = Omit<
  MarsSiteViewContext,
  'onAPXSLaunchMinigame' | 'onAPXSBlockedByCold'
> & {
  /** Returns the latest rock-type → element weights map (e.g. from `/data/apxs-compositions.json`). */
  getApxsCompositionWeights: () => Record<string, Record<string, number>>
  apxsGameRockUuid: Ref<string>
  apxsGameRockType: Ref<string>
  apxsGameRockLabel: Ref<string>
  apxsGameComposition: Ref<APXSComposition | null>
  apxsGameDuration: Ref<number>
  apxsMinigameOpen: Ref<boolean>
  apxsState: Ref<APXSCountdownState>
}

/**
 * Assembles the {@link MarsSiteViewContext} passed into {@link createMarsSiteViewController}, including
 * APXS minigame wiring (composition generation and ref updates).
 * @param deps Refs, composable callbacks, and APXS bridge state from the Martian site view
 */
export function buildMarsSiteViewContext(deps: MartianSiteViewContextDeps): MarsSiteViewContext {
  const {
    getApxsCompositionWeights,
    apxsGameRockUuid,
    apxsGameRockType,
    apxsGameRockLabel,
    apxsGameComposition,
    apxsGameDuration,
    apxsMinigameOpen,
    apxsState,
    sampleToastRef,
    ...rest
  } = deps

  return {
    ...rest,
    sampleToastRef,
    onAPXSLaunchMinigame: (rockMeshUuid, rockType, rockLabel, durationSec) => {
      const weights = getApxsCompositionWeights()
      const baseWeights = weights[rockType] ?? weights.basalt ?? {}
      const comp = generateComposition(baseWeights)
      apxsGameRockUuid.value = rockMeshUuid
      apxsGameRockType.value = rockType
      apxsGameRockLabel.value = rockLabel
      apxsGameComposition.value = comp
      apxsGameDuration.value = durationSec
      apxsMinigameOpen.value = true
      apxsState.value = 'playing'
    },
    onAPXSBlockedByCold: () => {
      sampleToastRef.value?.showError('Too cold for APXS — warm up first')
    },
  }
}
