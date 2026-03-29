import * as THREE from 'three'
import { InstrumentController } from './InstrumentController'

const COVER_LERP_SPEED = 2.5  // progress per second (0→1 in ~0.4s)
const COVER_NAMES = ['cover_01', 'cover_02', 'cover_03']

export class SAMController extends InstrumentController {
  readonly id = 'sam'
  readonly name = 'SAM'
  readonly slot = 6
  readonly focusNodeName = 'SAM'
  readonly focusOffset = new THREE.Vector3(0.0, 0.1, 0.1)
  readonly viewAngle = 0.1
  readonly viewPitch = 1.1
  override readonly canActivate = true
  override readonly passiveDecayPerSol = 0.40
  override readonly repairComponentId = 'science-components'
  override readonly usageDecayChance = 0.20
  override readonly usageDecayAmount = 1.5

  // Cover animation
  private covers: THREE.Object3D[] = []
  private coverOpenQuats: THREE.Quaternion[] = []
  private coverClosedQuats: THREE.Quaternion[] = []
  private coverProgress = 0  // 0 = closed, 1 = open
  private coverTarget = 0    // 0 or 1
  coversOpen = false          // read by UI

  /**
   * Call with the bind-pose quaternions captured from SiteScene
   * before the deployment animation ran. These are the true closed poses.
   */
  attachWithBindPoses(rover: THREE.Group, bindQuats: Map<string, THREE.Quaternion>): void {
    super.attach(rover)

    for (const name of COVER_NAMES) {
      const node = rover.getObjectByName(name)
      if (node) {
        this.covers.push(node)
        // Open = current deployed pose (after animation)
        this.coverOpenQuats.push(node.quaternion.clone())
        // Closed = bind pose from before animation
        const bindQuat = bindQuats.get(name)
        this.coverClosedQuats.push(bindQuat ? bindQuat.clone() : node.quaternion.clone())
      } else {
        console.warn(`[SAM] Cover node "${name}" not found`)
      }
    }

    // Start closed — snap immediately
    this.coverProgress = 0
    this.coverTarget = 0
    this.coversOpen = false
    this.applyCovers()
  }

  openCovers(): void {
    this.coverTarget = 1
  }

  closeCovers(): void {
    this.coverTarget = 0
  }

  override update(delta: number): void {
    // Lerp cover progress toward target
    if (this.coverProgress !== this.coverTarget) {
      if (this.coverTarget === 1) {
        this.coverProgress = Math.min(1, this.coverProgress + COVER_LERP_SPEED * delta)
      } else {
        this.coverProgress = Math.max(0, this.coverProgress - COVER_LERP_SPEED * delta)
      }
      this.applyCovers()
      this.coversOpen = this.coverProgress >= 1
    }
  }

  private applyCovers(): void {
    for (let i = 0; i < this.covers.length; i++) {
      const cover = this.covers[i]
      const closed = this.coverClosedQuats[i]
      const open = this.coverOpenQuats[i]
      if (cover && closed && open) {
        cover.quaternion.copy(closed).slerp(open, this.coverProgress)
      }
    }
  }

  deactivate(): void {
    this.closeCovers()
  }

  /** SAM draws power only during active experiments — not from card view or activate. */
  experimentRunning = false
  override getInstrumentBusPowerW(_phase: 'instrument' | 'active'): number {
    return this.experimentRunning ? 25 : 0
  }
}
