import { ref } from 'vue'

/**
 * Tracks MastCam-tagged rock types for mission objective checking.
 * The MastCam tick handler calls `recordTag()` on each scan complete.
 */

/** Map of rockType -> count of tagged rocks */
const tagCounts = ref<Record<string, number>>({})

export function recordMastCamTag(rockType: string): void {
  tagCounts.value = {
    ...tagCounts.value,
    [rockType]: (tagCounts.value[rockType] ?? 0) + 1,
  }
}

export function getMastCamTagCount(rockType: string): number {
  return tagCounts.value[rockType] ?? 0
}

export function getTotalMastCamTags(): number {
  return Object.values(tagCounts.value).reduce((sum, n) => sum + n, 0)
}

export function resetMastCamTagsForTests(): void {
  tagCounts.value = {}
}

export function useMastCamTags() {
  return {
    tagCounts,
    recordMastCamTag,
    getMastCamTagCount,
    getTotalMastCamTags,
  }
}
