import * as THREE from 'three'

/** Emissive tint (hex) on the instrument’s GLTF focus subtree while its slot is selected or active. */
export const INSTRUMENT_SELECTION_GLOW_HEX = 0x40c8f0

const SELECTION_GLOW_INTENSITY_BASE = 0.32
const SELECTION_GLOW_INTENSITY_PULSE = 0.06
const SELECTION_GLOW_SPEED = 2.2

/**
 * Pulse intensity for {@link INSTRUMENT_SELECTION_GLOW_HEX} (driven by scene time).
 */
export function instrumentSelectionEmissiveIntensity(simulationTime: number): number {
  return SELECTION_GLOW_INTENSITY_BASE + Math.sin(simulationTime * SELECTION_GLOW_SPEED) * SELECTION_GLOW_INTENSITY_PULSE
}

// --- TODO: Instrument durability & modifier system ---
// Every instrument should support:
//  - Durability (0–100%): degrades with use. Lower durability = reduced efficiency
//    (not binary — a 50% durable laser is slower, not dead). At 0% = fully broken.
//  - Repair: costs mined resources. Some instruments harder to fix than others
//    (e.g. SAM internals vs MastCam lens). Repair difficulty as a per-instrument constant.
//  - Upgrades: permanent efficiency boosts (e.g. APXS precision module, heater insulation).
//  - Player class buffs/nerfs: percentage multipliers from RoverPowerProfile applied to
//    power draw, analysis speed, output quality, etc.
// Final effective value = base * durabilityFactor * upgradeMult * classMult

export abstract class InstrumentController {
  abstract readonly id: string
  abstract readonly name: string
  abstract readonly slot: number
  abstract readonly focusNodeName: string
  abstract readonly focusOffset: THREE.Vector3
  abstract readonly viewAngle: number   // orbit angle the camera snaps to (radians)
  abstract readonly viewPitch: number   // orbit pitch the camera snaps to (radians)
  readonly altNodeNames: string[] = []
  readonly canActivate: boolean = false

  /**
   * Baseline main-bus draw (W) while this instrument’s slot is open — used by the default
   * {@link getInstrumentBusPowerW} implementation. Override the getter when draw is dynamic.
   */
  readonly selectionIdlePowerW: number = 0

  /**
   * When true, this payload draws {@link selectionIdlePowerW} on the main bus whenever the rover
   * is deployed and {@link passiveSubsystemEnabled} is true — including while driving (no card open).
   * Focus-orbit selection does not add a second line ({@link getInstrumentBusPowerW} returns 0).
   */
  readonly billsPassiveBackgroundPower: boolean = false

  /**
   * When true, ACTIVATE / Key E only toggles {@link passiveSubsystemEnabled}; the rover never
   * enters `active` instrument mode for this tool (DAN, REMS, RAD, comms).
   */
  readonly passiveSubsystemOnly: boolean = false

  /**
   * For {@link billsPassiveBackgroundPower} / {@link passiveSubsystemOnly}: when false, no passive draw.
   * Toggled by ACTIVATE (STANDBY) from the instrument card. Default off — player enables each payload.
   */
  passiveSubsystemEnabled = false

  /**
   * When non-null, the view applies a pulsing emissive on this instrument’s focus subtree while selected.
   * Set to `null` if the instrument uses conflicting mesh VFX (e.g. RTG overdrive on the same node).
   */
  readonly selectionHighlightColor: number | null = INSTRUMENT_SELECTION_GLOW_HEX

  node: THREE.Object3D | null = null
  attached = false

  /** True after materials under `node` were cloned for selection glow (avoids mutating shared GLTF materials). */
  private focusBranchMaterialsCloned = false

  attach(rover: THREE.Group): void {
    if (this.attached) return
    this.attached = true
    this.node = rover.getObjectByName(this.focusNodeName) ?? null
    if (!this.node) {
      for (const alt of this.altNodeNames) {
        this.node = rover.getObjectByName(alt) ?? null
        if (this.node) break
      }
    }
    if (!this.node) {
      console.warn(`[${this.id}] Node "${this.focusNodeName}" not found in rover`)
    }
    if (this.selectionHighlightColor != null) {
      this.cloneMaterialsUnderFocusNode()
    }
  }

  /**
   * Clones mesh materials on the resolved focus subtree so selection emissive never tints unrelated rover parts.
   */
  protected cloneMaterialsUnderFocusNode(): void {
    if (!this.node || this.focusBranchMaterialsCloned) return
    this.node.traverse((child) => {
      if (!(child as THREE.Mesh).isMesh) return
      const mesh = child as THREE.Mesh
      const m = mesh.material
      if (Array.isArray(m)) {
        mesh.material = m.map((mat) => (mat as THREE.Material).clone())
      } else {
        mesh.material = (m as THREE.Material).clone()
      }
    })
    this.focusBranchMaterialsCloned = true
  }

  update(_delta: number): void {
    // Override per-instrument for animation (stubs for now)
  }

  handleInput(_keys: Set<string>, _delta: number): void {
    // Override per-instrument for active-mode input handling
  }

  getWorldFocusPosition(): THREE.Vector3 {
    if (!this.node) return new THREE.Vector3()
    const worldPos = new THREE.Vector3()
    this.node.getWorldPosition(worldPos)
    return worldPos
  }

  /**
   * Main-bus watts billed while this tool is the focused slot (instrument card / orbit or after ACTIVATE).
   * Does not include special lines (e.g. rock drill bit, heater thermal) — those stay separate in {@link useMarsPower}.
   * Passive background payloads return 0 here so they are not double-counted with {@link getPassiveBackgroundPowerW}.
   */
  getInstrumentBusPowerW(_phase: 'instrument' | 'active'): number {
    if (this.billsPassiveBackgroundPower) return 0
    return this.selectionIdlePowerW
  }

  /**
   * Continuous passive draw (W) while deployed and {@link passiveSubsystemEnabled}.
   */
  getPassiveBackgroundPowerW(): number {
    if (!this.billsPassiveBackgroundPower || !this.passiveSubsystemEnabled) return 0
    return this.selectionIdlePowerW
  }

  /** Flip passive power (STANDBY ↔ running). No-op unless {@link passiveSubsystemOnly}. */
  togglePassiveSubsystemEnabled(): boolean {
    if (!this.passiveSubsystemOnly) return false
    this.passiveSubsystemEnabled = !this.passiveSubsystemEnabled
    return true
  }

  dispose(): void {
    // Override for cleanup
  }
}
