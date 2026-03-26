import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js'
import { VignetteShader } from 'three/addons/shaders/VignetteShader.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import patronParticlesVert from '@/three/shaders/patron-particles.vert.glsl?raw'
import patronParticlesFrag from '@/three/shaders/patron-particles.frag.glsl?raw'

const MAX_PARTICLES = 50000
const MORPH_DURATION = 2.5
const MOUSE_LERP = 0.05

export class PatronScene {
  readonly scene = new THREE.Scene()
  readonly camera: THREE.PerspectiveCamera

  private renderer: THREE.WebGLRenderer | null = null
  private composer: EffectComposer | null = null
  private clock = new THREE.Clock(false)
  private rafId = 0
  private material: THREE.ShaderMaterial | null = null
  private pointsGroup: THREE.Group | null = null
  private morphProgress = 0
  private mouseTarget = new THREE.Vector2(0, 0)
  private mouseCurrent = new THREE.Vector2(0, 0)
  private targetRotation = new THREE.Euler(0, 0, 0)

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(35, aspect, 0.1, 100)
    this.camera.position.set(0, 0.5, 5.5)
    this.camera.lookAt(0, 0.8, 0)
    this.scene.background = new THREE.Color(0x000000)
  }

  async init(canvas: HTMLCanvasElement): Promise<void> {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.setSize(canvas.clientWidth, canvas.clientHeight)

    // Load skull and extract vertices
    const loader = new GLTFLoader()
    const gltf = await loader.loadAsync('/soulless.glb')
    const skullPositions = this.extractVertices(gltf.scene)
    const particleCount = Math.min(skullPositions.length / 3, MAX_PARTICLES)

    // Build particle geometry
    const geometry = new THREE.BufferGeometry()
    const randomPositions = new Float32Array(particleCount * 3)
    const targetPositions = new Float32Array(particleCount * 3)
    const sizes = new Float32Array(particleCount)
    const randoms = new Float32Array(particleCount)

    for (let i = 0; i < particleCount; i++) {
      // Spawn off-screen — scattered far out so they fly in
      const theta = Math.random() * Math.PI * 2
      const phi = Math.acos(2 * Math.random() - 1)
      const r = 8 + Math.random() * 12
      randomPositions[i * 3] = r * Math.sin(phi) * Math.cos(theta)
      randomPositions[i * 3 + 1] = r * Math.cos(phi)
      randomPositions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta)

      // Target = skull vertex (sample evenly if more verts than MAX_PARTICLES)
      const srcIdx = Math.floor((i / particleCount) * (skullPositions.length / 3))
      targetPositions[i * 3] = skullPositions[srcIdx * 3]
      targetPositions[i * 3 + 1] = skullPositions[srcIdx * 3 + 1]
      targetPositions[i * 3 + 2] = skullPositions[srcIdx * 3 + 2]

      sizes[i] = 0.3 + Math.random() * 0.5
      randoms[i] = Math.random()
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(randomPositions, 3))
    geometry.setAttribute('aTargetPosition', new THREE.BufferAttribute(targetPositions, 3))
    geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1))
    geometry.setAttribute('aRandom', new THREE.BufferAttribute(randoms, 1))

    this.material = new THREE.ShaderMaterial({
      vertexShader: patronParticlesVert,
      fragmentShader: patronParticlesFrag,
      uniforms: {
        uProgress: { value: 0 },
        uTime: { value: 0 },
        uMouse: { value: new THREE.Vector2(0, 0) },
        uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })

    const points = new THREE.Points(geometry, this.material)
    this.pointsGroup = new THREE.Group()
    this.pointsGroup.add(points)
    this.scene.add(this.pointsGroup)

    // Post-processing
    this.composer = new EffectComposer(this.renderer)
    this.composer.addPass(new RenderPass(this.scene, this.camera))

    const bloomPass = new UnrealBloomPass(
      new THREE.Vector2(canvas.clientWidth, canvas.clientHeight),
      0.3,   // strength
      0.4,   // radius
      0.6,   // threshold
    )
    this.composer.addPass(bloomPass)

    const vignettePass = new ShaderPass(VignetteShader)
    vignettePass.uniforms['offset'].value = 0.95
    vignettePass.uniforms['darkness'].value = 1.2
    this.composer.addPass(vignettePass)
  }

  private extractVertices(scene: THREE.Object3D): Float32Array {
    const allPositions: number[] = []
    scene.updateMatrixWorld(true)

    scene.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return
      const geo = child.geometry as THREE.BufferGeometry
      const posAttr = geo.getAttribute('position')
      if (!posAttr) return

      // Apply world matrix to get vertices in world space
      const vertex = new THREE.Vector3()
      for (let i = 0; i < posAttr.count; i++) {
        vertex.set(posAttr.getX(i), posAttr.getY(i), posAttr.getZ(i))
        vertex.applyMatrix4(child.matrixWorld)
        allPositions.push(vertex.x, vertex.y, vertex.z)
      }
    })

    // Center and normalize
    const arr = new Float32Array(allPositions)
    const box = new THREE.Box3()
    const v = new THREE.Vector3()
    for (let i = 0; i < arr.length; i += 3) {
      v.set(arr[i], arr[i + 1], arr[i + 2])
      box.expandByPoint(v)
    }
    const center = box.getCenter(new THREE.Vector3())
    const size = box.getSize(new THREE.Vector3())
    const maxDim = Math.max(size.x, size.y, size.z)
    const scale = 2.6 / maxDim // normalize to ~2.6 units tall

    for (let i = 0; i < arr.length; i += 3) {
      arr[i] = (arr[i] - center.x) * scale
      arr[i + 1] = (arr[i + 1] - center.y) * scale + 1.6 // offset upward
      arr[i + 2] = -(arr[i + 2] - center.z) * scale // flip Z to face camera
    }

    return arr
  }

  startLoop(): void {
    this.clock.start()
    this.morphProgress = 0
    const tick = () => {
      this.rafId = requestAnimationFrame(tick)
      const delta = this.clock.getDelta()
      const elapsed = this.clock.getElapsedTime()
      this.update(delta, elapsed)
      this.composer?.render()
    }
    tick()
  }

  private update(delta: number, elapsed: number): void {
    if (!this.material) return

    // Morph progress
    if (this.morphProgress < 1) {
      this.morphProgress = Math.min(this.morphProgress + delta / MORPH_DURATION, 1)
    }
    const eased = THREE.MathUtils.smoothstep(this.morphProgress, 0, 1)
    this.material.uniforms.uProgress.value = eased
    this.material.uniforms.uTime.value = elapsed

    // Smooth mouse follow — rotate skull to look at cursor
    this.mouseCurrent.lerp(this.mouseTarget, MOUSE_LERP)
    this.material.uniforms.uMouse.value.copy(this.mouseCurrent)

    if (this.pointsGroup) {
      // Target rotation: Y = horizontal look, X = vertical tilt
      this.targetRotation.set(
        0.15 - this.mouseCurrent.y * 0.3,  // base tilt down + mouse up/down
        Math.PI + this.mouseCurrent.x * 0.4,   // face camera + turn left/right
        0,
      )
      // Lerp toward target
      this.pointsGroup.rotation.x += (this.targetRotation.x - this.pointsGroup.rotation.x) * MOUSE_LERP
      this.pointsGroup.rotation.y += (this.targetRotation.y - this.pointsGroup.rotation.y) * MOUSE_LERP
    }

  }

  /** Update mouse position — normalized -1 to 1 */
  setMouse(x: number, y: number): void {
    this.mouseTarget.set(x, y)
  }

  resize(width: number, height: number): void {
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
    this.renderer?.setSize(width, height)
    this.composer?.setSize(width, height)
  }

  dispose(): void {
    cancelAnimationFrame(this.rafId)
    this.clock.stop()
    this.renderer?.dispose()
    this.scene.traverse((child) => {
      if (child instanceof THREE.Points) {
        child.geometry.dispose()
        ;(child.material as THREE.Material).dispose()
      }
    })
  }
}
