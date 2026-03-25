import type { SiteMissionPoi } from './useSiteMissionPois'
import type { ObjectiveType } from '@/types/missions'

export interface CheckerContext {
  roverX: number
  roverZ: number
  pois: SiteMissionPoi[]
}

type ObjectiveChecker = (params: Record<string, any>, ctx: CheckerContext) => boolean

function poiDistance(ctx: CheckerContext, poiId: string): number {
  const poi = ctx.pois.find((p) => p.id === poiId)
  if (!poi) return Infinity
  const dx = ctx.roverX - poi.x
  const dz = ctx.roverZ - poi.z
  return Math.sqrt(dx * dx + dz * dz)
}

const checkers: Record<string, ObjectiveChecker> = {
  'go-to': (p, ctx) => poiDistance(ctx, p.poiId) < 10,
  'gather': (_p) => false,
  'sam-experiment': (_p) => false,
  'apxs': (_p) => false,
  'mastcam-tag': (_p) => false,
  'chemcam': (_p) => false,
  'dan-prospect': (_p) => false,
  'transmit': (_p) => false,
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
