import type { SiteMissionPoi } from './useSiteMissionPois'
import type { ObjectiveType } from '@/types/missions'
import { hasArrivedAtPoi } from './usePoiArrival'

export interface CheckerContext {
  roverX: number
  roverZ: number
  pois: SiteMissionPoi[]
}

type ObjectiveChecker = (params: Record<string, any>, ctx: CheckerContext) => boolean

const checkers: Record<string, ObjectiveChecker> = {
  'go-to': (p) => hasArrivedAtPoi(p.poiId),
  'gather': (_p) => false,
  'sam-experiment': (_p) => false,
  'apxs': (_p) => false,
  'mastcam-tag': (_p) => false,
  'chemcam': (_p) => false,
  'dan-prospect': (_p) => false,
  'transmit': (_p) => false,
  'rtg-overdrive': (_p) => false,
  'rtg-shunt': (_p) => false,
}

export function checkObjective(
  type: ObjectiveType | string,
  params: Record<string, any>,
  ctx: CheckerContext,
): boolean {
  const checker = checkers[type]
  if (!checker) return false
  return checker(params, ctx)
}

export function registerChecker(type: string, checker: ObjectiveChecker): void {
  checkers[type] = checker
}
