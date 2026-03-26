import * as THREE from 'three'
import marsEnvCubemapVert from '@/three/shaders/mars-env-cubemap.vert.glsl?raw'
import marsEnvCubemapFrag from '@/three/shaders/mars-env-cubemap.frag.glsl?raw'

/**
 * Generates a procedural Mars-tinted environment cube map for PBR reflections.
 *
 * Without an environment map, MeshStandardMaterial metallic surfaces appear
 * flat black — this gives them something to reflect (warm Martian sky gradient
 * with subtle ground bounce).
 */
export function createMarsEnvironment(renderer: THREE.WebGLRenderer): THREE.Texture {
  const pmrem = new THREE.PMREMGenerator(renderer)
  pmrem.compileCubemapShader()

  // Build a tiny scene with a gradient sky sphere that approximates
  // the diffuse Martian sky (warm peach upper hemisphere, darker rusty ground).
  const envScene = new THREE.Scene()

  const envMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {},
    vertexShader: marsEnvCubemapVert,
    fragmentShader: marsEnvCubemapFrag,
  })

  const envMesh = new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), envMat)
  envScene.add(envMesh)

  const envMap = pmrem.fromScene(envScene, 0, 0.1, 100).texture
  envMat.dispose()
  envMesh.geometry.dispose()
  pmrem.dispose()

  return envMap
}
