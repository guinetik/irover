export type ObjectiveType =
  | 'go-to'
  | 'gather'
  | 'sam-experiment'
  | 'apxs'
  | 'mastcam-tag'
  | 'chemcam'
  | 'dan-prospect'
  | 'transmit'
  | 'rtg-overdrive'
  | 'rtg-shunt'
  | 'rems-activate'
  | 'use-repair-kit'
  | 'install-upgrade'
  | 'dsn-firmware-install'

export interface ObjectiveDef {
  id: string
  type: ObjectiveType
  label: string
  params: Record<string, any>
  sequential: boolean
}

export interface MissionReward {
  sp?: number
  items?: Array<{ id: string; quantity: number }>
}

export interface MissionDef {
  id: string
  name: string
  patron: string | null
  description: string
  briefing: string
  reward: MissionReward
  unlocks: string[]
  chain: string | null
  objectives: ObjectiveDef[]
}

export interface MissionCatalog {
  version: number
  missions: MissionDef[]
}

export interface ObjectiveState {
  id: string
  done: boolean
}

export interface MissionState {
  missionId: string
  status: 'active' | 'awaiting-transmit' | 'completed'
  acceptedAtSol: number
  completedAtSol?: number
  objectives: ObjectiveState[]
}
