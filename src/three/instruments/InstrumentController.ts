import * as THREE from 'three'

/** Emissive tint (hex) on the instrument's GLTF focus subtree while its slot is selected or active. */
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
  /**
   * Optional GLTF object names for selection emissive + {@link getWorldFocusPosition} centroid.
   * When empty, behavior uses only the subtree rooted at {@link node}.
   */
  readonly selectionHighlightRootNames: readonly string[] = []
  /**
   * When true, only the first name in {@link selectionHighlightRootNames} that exists under the rover is used
   * (alias chain for the same logical part). When false, every resolved name is highlighted.
   */
  readonly selectionHighlightResolveFirstOnly: boolean = false
  readonly canActivate: boolean = false

  /**
   * Baseline main-bus draw (W) while this instrument's slot is open — used by the default
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
   * Toggled by ACTIVATE (STANDBY) from the instrument card. Default **on** at deploy; player can STANDBY.
   */
  passiveSubsystemEnabled = true

  // ── Durability system ──────────────────────────────────────────────
  durabilityPct = 100
  maxDurability = 100
  readonly breakThreshold: number = 25
  readonly passiveDecayPerSol: number = 0.25
  readonly usageDecayChance: number = 0.20
  readonly usageDecayAmount: number = 1.0
  readonly repairComponentId: string = 'engineering-components'
  hazardDecayMultiplier = 1.0

  // ── Upgrade system ──────────────────────────────────────────────────
  upgradeLevel = 0
  readonly maxUpgradeLevel: number = 1

  /**
   * When non-null, the view applies a pulsing emissive on this instrument's focus subtree while selected.
   * Colour shifts from cyan (healthy) through green/yellow/orange as durability drops.
   * Subclasses may override with a fixed value or `null` (e.g. RTG overdrive on the same node).
   */
  get selectionHighlightColor(): number | null {
    if (this.durabilityPct >= 85) return 0x40c8f0  // cyan
    if (this.durabilityPct >= 60) return 0x40f080   // green
    if (this.durabilityPct >= 40) return 0xf0e040   // yellow
    if (this.durabilityPct > this.breakThreshold) return 0xf0a030  // orange
    return 0x804020  // dim brown (broken)
  }

  get durabilityFactor(): number {
    return Math.max(0, (this.durabilityPct - this.breakThreshold) / (100 - this.breakThreshold))
  }

  get operational(): boolean {
    return this.durabilityPct > this.breakThreshold
  }

  applyPassiveDecay(solDelta: number): void {
    if (this.durabilityPct <= this.breakThreshold) return
    this.durabilityPct = Math.max(
      this.breakThreshold,
      this.durabilityPct - this.passiveDecayPerSol * this.hazardDecayMultiplier * solDelta,
    )
  }

  rollUsageDecay(): void {
    if (this.durabilityPct <= this.breakThreshold) return
    if (Math.random() < this.usageDecayChance) {
      this.durabilityPct = Math.max(
        this.breakThreshold,
        this.durabilityPct - this.usageDecayAmount,
      )
    }
  }

  applyHazardDamage(amount: number): void {
    this.durabilityPct = Math.max(this.breakThreshold, this.durabilityPct - amount)
  }

  getRepairCost(): { weldingWire: number; componentId: string; componentQty: number } {
    const pct = this.durabilityPct
    if (pct >= 90) return { weldingWire: 1, componentId: this.repairComponentId, componentQty: 0 }
    if (pct >= 70) return { weldingWire: 2, componentId: this.repairComponentId, componentQty: 1 }
    if (pct >= 50) return { weldingWire: 3, componentId: this.repairComponentId, componentQty: 2 }
    return { weldingWire: 4, componentId: this.repairComponentId, componentQty: 3 }
  }

  repair(): void {
    if (this.durabilityPct <= this.breakThreshold) return  // permanently broken
    this.durabilityPct = this.maxDurability
    this.maxDurability = Math.max(this.breakThreshold + 1, this.maxDurability - 1)
  }

  get upgraded(): boolean {
    return this.upgradeLevel >= this.maxUpgradeLevel
  }

  applyUpgrade(): boolean {
    if (this.upgradeLevel >= this.maxUpgradeLevel) return false
    this.upgradeLevel += 1
    return true
  }

  node: THREE.Object3D | null = null
  attached = false

  /** Resolved from {@link selectionHighlightRootNames} in {@link attach}; drives glow + focus centroid when non-empty. */
  protected highlightRoots: THREE.Object3D[] = []

  /** True after materials under highlight roots were cloned for selection glow (avoids mutating shared GLTF materials). */
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

    this.highlightRoots = []
    for (const nm of this.selectionHighlightRootNames) {
      const o = rover.getObjectByName(nm)
      if (o) {
        this.highlightRoots.push(o)
        if (this.selectionHighlightResolveFirstOnly) break
      }
    }
    if (this.selectionHighlightRootNames.length > 0 && this.highlightRoots.length === 0) {
      console.warn(
        `[${this.id}] selectionHighlightRootNames: none of [${this.selectionHighlightRootNames.join(', ')}] found in rover`,
      )
    }

    if (this.selectionHighlightColor != null) {
      this.cloneMaterialsUnderFocusNode()
    }
  }

  /**
   * Subtrees that receive selection emissive in the rover VFX tick.
   */
  getSelectionHighlightRoots(): THREE.Object3D[] {
    if (this.highlightRoots.length > 0) return this.highlightRoots
    return this.node ? [this.node] : []
  }

  /**
   * Clones mesh materials on the highlight subtrees so selection emissive never tints unrelated rover parts.
   */
  protected cloneMaterialsUnderFocusNode(): void {
    if (this.focusBranchMaterialsCloned) return
    const roots = this.getSelectionHighlightRoots()
    if (roots.length === 0) return
    for (const root of roots) {
      root.traverse((child) => {
        if (!(child as THREE.Mesh).isMesh) return
        const mesh = child as THREE.Mesh
        const m = mesh.material
        if (Array.isArray(m)) {
          mesh.material = m.map((mat) => (mat as THREE.Material).clone())
        } else {
          mesh.material = (m as THREE.Material).clone()
        }
      })
    }
    this.focusBranchMaterialsCloned = true
  }

  update(_delta: number): void {
    // Override per-instrument for animation (stubs for now)
  }

  handleInput(_keys: Set<string>, _delta: number): void {
    // Override per-instrument for active-mode input handling
  }

  getWorldFocusPosition(): THREE.Vector3 {
    const roots = this.getSelectionHighlightRoots()
    if (roots.length > 0) {
      const acc = new THREE.Vector3()
      for (const root of roots) {
        const p = new THREE.Vector3()
        root.getWorldPosition(p)
        acc.add(p)
      }
      acc.multiplyScalar(1 / roots.length)
      return acc
    }
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
  getInstrumentBusPowerW(phase: 'instrument' | 'active'): number {
    if (this.billsPassiveBackgroundPower) return 0
    // Active tools draw power only when activated, not when merely selected
    if (phase === 'instrument') return 0
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
