import * as THREE from 'three'
import { InstrumentController } from './InstrumentController'
import { ROCK_TYPES, ROCK_TYPE_LIST, type RockTypeId } from '@/three/terrain/RockTypes'

const PAN_SPEED = 0.5      // radians/sec
const TILT_SPEED = 0.35    // radians/sec
const TILT_MIN = -0.5      // look up
const TILT_MAX = 0.6       // look down
const FOV_MIN = 20
const FOV_MAX = 65
const FOV_DEFAULT = 50
const ZOOM_STEP = 3        // FOV degrees per wheel tick
const SURVEY_RANGE = 40     // meters — rocks beyond this aren't highlighted
const SCAN_DURATION = 2.0   // seconds to complete a scan
const IDLE_POWER_W = 3      // base draw while MastCam is active
const SCAN_POWER_W = 5      // extra draw while scanning (total = idle + scan = 8W)

export class MastCamController extends InstrumentController {
  readonly id = 'mastcam'
  readonly name = 'MastCam'
  readonly slot = 1
  readonly focusNodeName = 'MastCam'
  readonly focusOffset = new THREE.Vector3(0.1, -0.05, 0.2)
  readonly viewAngle = 0.2
  readonly viewPitch = 0.05
  override readonly canActivate = true

  // Mast head node (for first-person camera position)
  private mastHead: THREE.Object3D | null = null

  // Pan/tilt state (relative to rover heading)
  panAngle = 0
  tiltAngle = 0
  fov = FOV_DEFAULT

  // Survey state
  private rocks: THREE.Mesh[] = []
  private overlayMeshes: THREE.Mesh[] = []
  private overlayScene: THREE.Scene | null = null
  private filterIndex = 0 // 0 = ALL, 1..N = specific type
  filterType: RockTypeId | null = null
  private filterTypes: (RockTypeId | null)[] = [null, ...ROCK_TYPE_LIST.map(t => t.id)]
  /** Stored original materials — restored on deactivate */
  private originalMaterials = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>()
  private surveyMat: THREE.MeshBasicMaterial | null = null

  // Scan state
  private scanning = false
  private scanProgress = 0
  scanTarget: THREE.Mesh | null = null
  /** Persistent tag markers above scanned rocks — survive mode exit */
  private tagMarkers = new Map<THREE.Mesh, THREE.Mesh>()
  /** True while scan key is held AND target is valid */
  get isScanning(): boolean { return this.scanning && this.scanTarget !== null }
  get scanProgressValue(): number { return this.scanProgress }
  /** Power draw: 3W idle + 5W extra while scanning */
  get powerDrawW(): number { return IDLE_POWER_W + (this.isScanning ? SCAN_POWER_W : 0) }

  // Camera state for RoverController to read
  /** World position of mast camera (offset forward for rendering) */
  readonly mastWorldPos = new THREE.Vector3()
  /** Raw mast origin (no forward offset — used for raycasting) */
  private readonly mastOrigin = new THREE.Vector3()
  /** World look direction from mast */
  readonly mastLookDir = new THREE.Vector3()
  /** World position of current scan target point (for crosshair projection) */
  readonly scanTargetWorldPos = new THREE.Vector3()

  override attach(rover: THREE.Group): void {
    super.attach(rover)
    // Try mast camera node, fall back to MastCam or mast_03001
    this.mastHead = rover.getObjectByName('MastCam')
      ?? rover.getObjectByName('mast_03001')
      ?? rover.getObjectByName('mast_03.001')
      ?? null
  }

  /** All scene meshes to darken during survey (terrain, rover, etc.) */
  private sceneMeshes: THREE.Mesh[] = []
  private sceneOriginalMaterials = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>()
  private originalBackground: THREE.Color | THREE.Texture | null = null
  private originalFog: THREE.Fog | THREE.FogExp2 | null = null

  initSurvey(scene: THREE.Scene, rocks: THREE.Mesh[], sceneMeshes?: THREE.Mesh[]): void {
    this.overlayScene = scene
    this.rocks = rocks
    if (sceneMeshes) this.sceneMeshes = sceneMeshes
  }

  cycleFilter(direction: number): void {
    this.filterIndex = (this.filterIndex + direction + this.filterTypes.length) % this.filterTypes.length
    this.filterType = this.filterTypes[this.filterIndex]
    this.rebuildOverlays()
  }

  get filterLabel(): string {
    return this.filterType ? ROCK_TYPES[this.filterType].label.toUpperCase() : 'ALL TYPES'
  }

  override handleInput(keys: Set<string>, delta: number): void {
    // A/D to pan mast (yaw)
    if (keys.has('KeyA') || keys.has('ArrowLeft')) {
      this.panAngle += PAN_SPEED * delta
    }
    if (keys.has('KeyD') || keys.has('ArrowRight')) {
      this.panAngle -= PAN_SPEED * delta
    }
    this.panAngle = Math.max(-Math.PI * 0.8, Math.min(Math.PI * 0.8, this.panAngle))

    // W/S to tilt mast (pitch)
    if (keys.has('KeyW') || keys.has('ArrowUp')) {
      this.tiltAngle = Math.max(TILT_MIN, this.tiltAngle - TILT_SPEED * delta)
    }
    if (keys.has('KeyS') || keys.has('ArrowDown')) {
      this.tiltAngle = Math.min(TILT_MAX, this.tiltAngle + TILT_SPEED * delta)
    }

    // Q to cycle filter
    if (keys.has('KeyQ')) {
      if (!this._qHeld) { this.cycleFilter(1); this._qHeld = true }
    } else { this._qHeld = false }

    // E to scan (hold)
    this.scanning = keys.has('KeyE')
  }

  /** Call from view's wheel handler when MastCam is active */
  handleWheel(deltaY: number): void {
    const dir = deltaY > 0 ? 1 : -1
    this.fov = Math.max(FOV_MIN, Math.min(FOV_MAX, this.fov + dir * ZOOM_STEP))
  }

  private _qHeld = false

  override update(delta: number): void {
    // Update mast world position + look direction
    if (this.mastHead) {
      this.mastHead.getWorldPosition(this.mastOrigin)
      this.mastWorldPos.copy(this.mastOrigin)
    }

    // Look direction from rover heading + pan angle
    const roverParent = this.node?.parent
    let baseHeading = 0
    if (roverParent) {
      const euler = new THREE.Euler().setFromQuaternion(roverParent.quaternion, 'YXZ')
      baseHeading = euler.y
    }
    const lookAngle = baseHeading + this.panAngle + Math.PI
    const cosTilt = Math.cos(this.tiltAngle)
    this.mastLookDir.set(
      -Math.sin(lookAngle) * cosTilt,
      -Math.sin(this.tiltAngle),
      -Math.cos(lookAngle) * cosTilt,
    ).normalize()

    // Push camera forward past the mast housing so we don't see it
    this.mastWorldPos.addScaledVector(this.mastLookDir, 0.35)

    // Always find what we're looking at (for crosshair feedback even when not scanning)
    const lookTarget = this.findLookTarget()

    if (lookTarget) {
      lookTarget.getWorldPosition(this.scanTargetWorldPos)
    } else {
      // Point far along look direction when nothing targeted
      this.scanTargetWorldPos.copy(this.mastOrigin).addScaledVector(this.mastLookDir, 20)
    }

    // Scan logic
    if (this.scanning && lookTarget && !lookTarget.userData.mastcamScanned) {
      this.scanTarget = lookTarget
      this.scanProgress += delta / SCAN_DURATION
      if (this.scanProgress >= 1) {
        this.scanTarget.userData.mastcamScanned = true
        this.addTagMarker(this.scanTarget)
        this.scanProgress = 0
        this.scanning = false
        this.rebuildOverlays()
      }
    } else if (!this.scanning || !lookTarget || lookTarget.userData.mastcamScanned) {
      this.scanProgress = 0
      this.scanTarget = this.scanning ? lookTarget : null
    }
  }

  private findLookTarget(): THREE.Mesh | null {
    const raycaster = new THREE.Raycaster(this.mastOrigin, this.mastLookDir, 0, SURVEY_RANGE)
    const hits = raycaster.intersectObjects(this.rocks, false)
    for (const hit of hits) {
      const rock = hit.object as THREE.Mesh
      if (!rock.userData.mastcamScanned) return rock
    }
    // If we hit a scanned rock, still return it for feedback
    return hits.length > 0 ? hits[0].object as THREE.Mesh : null
  }

  /** Create a persistent floating tag above a scanned rock */
  private addTagMarker(rock: THREE.Mesh): void {
    if (this.tagMarkers.has(rock) || !this.overlayScene) return
    const type = rock.userData.rockType as RockTypeId | undefined
    const surveyColor = type ? (MastCamController.SURVEY_COLORS[type] ?? 0xffffff) : 0xffffff

    // Small diamond shape
    const geo = new THREE.OctahedronGeometry(0.06, 0)
    const mat = new THREE.MeshBasicMaterial({
      color: surveyColor,
      transparent: true,
      opacity: 0.9,
      depthTest: false,
    })
    const marker = new THREE.Mesh(geo, mat)
    marker.renderOrder = 100

    // Position above rock
    const rockPos = new THREE.Vector3()
    rock.getWorldPosition(rockPos)
    marker.position.set(rockPos.x, rockPos.y + 0.5, rockPos.z)
    marker.userData._baseY = rockPos.y + 0.5
    marker.userData._rockRef = rock

    this.overlayScene.add(marker)
    this.tagMarkers.set(rock, marker)
  }

  /** Call each frame (from view) to animate tag markers — works outside active mode */
  updateTagMarkers(elapsed: number): void {
    for (const [rock, marker] of this.tagMarkers) {
      // Remove if rock was depleted (mined)
      if (rock.userData.depleted) {
        marker.parent?.remove(marker)
        marker.geometry.dispose()
        ;(marker.material as THREE.Material).dispose()
        this.tagMarkers.delete(rock)
        continue
      }
      // Float and spin
      const baseY = marker.userData._baseY as number
      marker.position.y = baseY + Math.sin(elapsed * 2) * 0.06
      marker.rotation.y = elapsed * 1.5
    }
  }

  /** Swap rock + scene materials to wireframe for survey mode */
  enterSurveyMode(): void {
    if (!this.surveyMat) {
      this.surveyMat = new THREE.MeshBasicMaterial({
        color: 0x000000,
      })
    }
    // Black background, kill fog
    if (this.overlayScene) {
      this.originalBackground = this.overlayScene.background as THREE.Color | THREE.Texture | null
      this.originalFog = this.overlayScene.fog
      this.overlayScene.background = new THREE.Color(0x000000)
      this.overlayScene.fog = null
    }

    // Rocks go black — wireframe overlays provide the neon color
    for (const rock of this.rocks) {
      if (!this.originalMaterials.has(rock)) {
        this.originalMaterials.set(rock, rock.material)
      }
      rock.material = this.surveyMat
    }
    // Scene meshes → black fill + white wireframe
    for (const mesh of this.sceneMeshes) {
      if (!this.sceneOriginalMaterials.has(mesh)) {
        this.sceneOriginalMaterials.set(mesh, mesh.material)
      }
      const wireMat = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        wireframe: true,
        transparent: true,
        opacity: 0.15,
      })
      mesh.material = wireMat
    }
  }

  /** Restore original materials */
  exitSurveyMode(): void {
    // Restore background + fog
    if (this.overlayScene) {
      this.overlayScene.background = this.originalBackground
      this.overlayScene.fog = this.originalFog
    }

    for (const [rock, mat] of this.originalMaterials) {
      rock.material = mat
    }
    this.originalMaterials.clear()
    for (const [mesh, mat] of this.sceneOriginalMaterials) {
      if (Array.isArray(mesh.material)) {
        mesh.material.forEach(m => m.dispose())
      } else {
        (mesh.material as THREE.Material).dispose()
      }
      mesh.material = mat
    }
    this.sceneOriginalMaterials.clear()
  }

  // Neon survey colors — must pop against dark wireframe scene
  private static SURVEY_COLORS: Record<string, number> = {
    basalt: 0x4488ff,
    hematite: 0xff2222,
    olivine: 0x00ff66,
    sulfate: 0xffff00,
    mudstone: 0xff8833,
    'iron-meteorite': 0x00ffff,
  }

  /** Build/rebuild wireframe overlays on visible rocks */
  rebuildOverlays(): void {
    this.clearOverlays()
    if (!this.overlayScene) return

    for (const rock of this.rocks) {
      const type = rock.userData.rockType as RockTypeId | undefined
      if (!type) continue

      // Distance check from mast
      if (this.mastWorldPos.distanceTo(rock.position) > SURVEY_RANGE) continue

      // Filter check
      const matches = this.filterType === null || type === this.filterType
      const scanned = rock.userData.mastcamScanned === true

      const surveyColor = MastCamController.SURVEY_COLORS[type] ?? 0xc4753a
      const color = new THREE.Color(surveyColor)

      const wireGeo = new THREE.EdgesGeometry(rock.geometry, 15)
      const wireMat = new THREE.LineBasicMaterial({
        color: matches ? color : new THREE.Color(0x181818),
        transparent: true,
        opacity: matches ? 1.0 : 0.08,
        depthTest: true,
      })
      const wireframe = new THREE.LineSegments(wireGeo, wireMat) as unknown as THREE.Mesh
      wireframe.position.copy(rock.position)
      wireframe.rotation.copy(rock.rotation)
      wireframe.scale.copy(rock.scale).multiplyScalar(1.05)
      wireframe.renderOrder = 10

      // Neon glow shell for matching rocks
      if (matches) {
        const shellMat = new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: scanned ? 0.35 : 0.2,
          side: THREE.BackSide,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        })
        const shell = new THREE.Mesh(rock.geometry, shellMat)
        shell.position.copy(rock.position)
        shell.rotation.copy(rock.rotation)
        shell.scale.copy(rock.scale).multiplyScalar(1.2)
        shell.renderOrder = 9
        this.overlayScene.add(shell)
        this.overlayMeshes.push(shell)
      }

      this.overlayScene.add(wireframe)
      this.overlayMeshes.push(wireframe)
    }
  }

  clearOverlays(): void {
    for (const m of this.overlayMeshes) {
      m.parent?.remove(m)
      m.geometry.dispose()
      if (Array.isArray(m.material)) {
        m.material.forEach(mat => mat.dispose())
      } else {
        (m.material as THREE.Material).dispose()
      }
    }
    this.overlayMeshes = []
  }

  /** Reset on deactivation */
  deactivate(): void {
    this.exitSurveyMode()
    this.clearOverlays()
    this.panAngle = 0
    this.tiltAngle = 0
    this.fov = FOV_DEFAULT
    this.scanning = false
    this.scanProgress = 0
  }

  override dispose(): void {
    this.clearOverlays()
    for (const [, marker] of this.tagMarkers) {
      marker.parent?.remove(marker)
      marker.geometry.dispose()
      ;(marker.material as THREE.Material).dispose()
    }
    this.tagMarkers.clear()
  }
}
