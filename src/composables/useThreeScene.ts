// src/composables/useThreeScene.ts
import { ref } from 'vue'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js'
import {
  CAMERA_FOV,
  CAMERA_NEAR,
  CAMERA_FAR,
  CAMERA_MIN_DISTANCE,
  CAMERA_MAX_DISTANCE,
  CAMERA_DEFAULT_DISTANCE,
  AUTO_ROTATE_SPEED,
  AUTO_ROTATE_RESUME_DELAY,
  FLY_TO_DURATION,
} from '@/three/constants'

export function useThreeScene() {
  const currentZoom = ref(0)
  const currentTarget = ref(new THREE.Vector3())

  let renderer: THREE.WebGLRenderer | null = null
  let css2dRenderer: CSS2DRenderer | null = null
  let camera: THREE.PerspectiveCamera | null = null
  let controls: OrbitControls | null = null
  let clock: THREE.Clock | null = null
  let animationId = 0
  let updateCallback: ((elapsed: number) => void) | null = null

  // Auto-rotate idle timer
  let idleTimer: ReturnType<typeof setTimeout> | null = null

  // Fly-to state
  let flyToActive = false
  let flyToStart = 0
  let flyToStartPos = new THREE.Vector3()
  let flyToEndPos = new THREE.Vector3()
  let flyToStartTarget = new THREE.Vector3()
  let flyToEndTarget = new THREE.Vector3()
  let flyToResolve: (() => void) | null = null

  // Pointer tracking for raycaster
  const pointer = new THREE.Vector2(-999, -999)

  function init(canvas: HTMLCanvasElement, css2dContainer: HTMLDivElement) {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(canvas.clientWidth, canvas.clientHeight, false)
    renderer.setClearColor(0x000000, 1)

    css2dRenderer = new CSS2DRenderer({ element: css2dContainer })
    css2dRenderer.setSize(canvas.clientWidth, canvas.clientHeight)

    camera = new THREE.PerspectiveCamera(
      CAMERA_FOV,
      canvas.clientWidth / canvas.clientHeight,
      CAMERA_NEAR,
      CAMERA_FAR,
    )
    camera.position.set(0, 0, CAMERA_DEFAULT_DISTANCE)

    controls = new OrbitControls(camera, canvas)
    controls.enableDamping = true
    controls.dampingFactor = 0.05
    controls.minDistance = CAMERA_MIN_DISTANCE
    controls.maxDistance = CAMERA_MAX_DISTANCE
    controls.autoRotate = true
    controls.autoRotateSpeed = AUTO_ROTATE_SPEED
    controls.enablePan = false

    controls.addEventListener('start', onInteractionStart)
    controls.addEventListener('end', onInteractionEnd)

    clock = new THREE.Clock()

    canvas.addEventListener('pointermove', onPointerMove)
    canvas.addEventListener('click', onPointerClick)
    window.addEventListener('resize', onResize)
  }

  function onInteractionStart() {
    if (controls) controls.autoRotate = false
    if (idleTimer) clearTimeout(idleTimer)
  }

  function onInteractionEnd() {
    if (idleTimer) clearTimeout(idleTimer)
    idleTimer = setTimeout(() => {
      if (controls) controls.autoRotate = true
    }, AUTO_ROTATE_RESUME_DELAY)
  }

  function onPointerMove(e: PointerEvent) {
    const canvas = renderer?.domElement
    if (!canvas) return
    pointer.x = (e.offsetX / canvas.clientWidth) * 2 - 1
    pointer.y = -(e.offsetY / canvas.clientHeight) * 2 + 1
  }

  let onClickCallback: ((pointer: THREE.Vector2, camera: THREE.Camera) => void) | null = null

  function onPointerClick(_e: PointerEvent) {
    if (camera && onClickCallback) {
      onClickCallback(pointer, camera)
    }
  }

  function setClickHandler(handler: (pointer: THREE.Vector2, camera: THREE.Camera) => void) {
    onClickCallback = handler
  }

  function onResize() {
    const canvas = renderer?.domElement
    if (!canvas || !camera || !renderer || !css2dRenderer) return
    const width = canvas.clientWidth
    const height = canvas.clientHeight
    camera.aspect = width / height
    camera.updateProjectionMatrix()
    renderer.setSize(width, height, false)
    css2dRenderer.setSize(width, height)
  }

  function startLoop(scene: THREE.Scene, onUpdate: (elapsed: number) => void) {
    updateCallback = onUpdate

    function animate() {
      animationId = requestAnimationFrame(animate)
      if (!renderer || !camera || !controls || !clock || !css2dRenderer) return

      const elapsed = clock.getElapsedTime()

      // Fly-to animation
      if (flyToActive) {
        const t = Math.min(1, (elapsed - flyToStart) / FLY_TO_DURATION)
        const eased = t * t * (3 - 2 * t) // smoothstep
        camera.position.lerpVectors(flyToStartPos, flyToEndPos, eased)
        controls.target.lerpVectors(flyToStartTarget, flyToEndTarget, eased)

        if (t >= 1) {
          flyToActive = false
          controls.enabled = true
          flyToResolve?.()
        }
      }

      controls.update()
      updateCallback?.(elapsed)

      // Update zoom ref
      const dist = camera.position.distanceTo(controls.target)
      currentZoom.value = 1 - (dist - CAMERA_MIN_DISTANCE) / (CAMERA_MAX_DISTANCE - CAMERA_MIN_DISTANCE)
      currentTarget.value.copy(controls.target)

      renderer.render(scene, camera)
      css2dRenderer.render(scene, camera)
    }

    animate()
  }

  function flyTo(targetPosition: THREE.Vector3, distance: number): Promise<void> {
    if (!camera || !controls || !clock) return Promise.resolve()

    return new Promise((resolve) => {
      flyToResolve = resolve
      flyToActive = true
      flyToStart = clock!.getElapsedTime()
      flyToStartPos.copy(camera!.position)
      flyToStartTarget.copy(controls!.target)
      flyToEndTarget.copy(targetPosition)

      // Position camera along the surface normal at the given distance
      const direction = targetPosition.clone().normalize()
      flyToEndPos.copy(targetPosition).addScaledVector(direction, distance)

      controls!.enabled = false
      controls!.autoRotate = false
    })
  }

  function getCamera(): THREE.PerspectiveCamera | null {
    return camera
  }

  function getPointer(): THREE.Vector2 {
    return pointer
  }

  function dispose() {
    if (animationId) cancelAnimationFrame(animationId)
    controls?.removeEventListener('start', onInteractionStart)
    controls?.removeEventListener('end', onInteractionEnd)
    controls?.dispose()
    renderer?.domElement.removeEventListener('pointermove', onPointerMove)
    renderer?.domElement.removeEventListener('click', onPointerClick)
    window.removeEventListener('resize', onResize)
    renderer?.dispose()
    if (idleTimer) clearTimeout(idleTimer)
  }

  return {
    currentZoom,
    currentTarget,
    init,
    startLoop,
    flyTo,
    getCamera,
    getPointer,
    setClickHandler,
    dispose,
  }
}
