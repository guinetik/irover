import * as THREE from 'three'

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

  node: THREE.Object3D | null = null
  attached = false

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

  dispose(): void {
    // Override for cleanup
  }
}
