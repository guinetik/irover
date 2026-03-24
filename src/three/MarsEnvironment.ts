import * as THREE from 'three'

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
    vertexShader: /* glsl */ `
      varying vec3 vWorldPos;
      void main() {
        vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
        gl_Position = projectionMatrix * viewMatrix * vec4(vWorldPos, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec3 vWorldPos;
      void main() {
        vec3 dir = normalize(vWorldPos);
        float y = dir.y;

        // Upper sky: warm peach-salmon
        vec3 skyTop    = vec3(0.75, 0.55, 0.38);
        // Horizon: brighter dusty orange
        vec3 skyHorizon = vec3(0.85, 0.62, 0.42);
        // Ground: darker rusty brown
        vec3 ground    = vec3(0.25, 0.14, 0.08);

        vec3 color;
        if (y > 0.0) {
          // Sky hemisphere: horizon → top
          float t = pow(y, 0.5);
          color = mix(skyHorizon, skyTop, t);
        } else {
          // Ground hemisphere: horizon → nadir
          float t = pow(-y, 0.7);
          color = mix(skyHorizon * 0.6, ground, t);
        }

        // Subtle sun hotspot (boosts specular highlights on metals)
        vec3 sunDir = normalize(vec3(0.5, 0.4, 0.3));
        float sunDot = max(0.0, dot(dir, sunDir));
        color += vec3(0.4, 0.3, 0.2) * pow(sunDot, 32.0);
        color += vec3(0.15, 0.10, 0.06) * pow(sunDot, 4.0);

        gl_FragColor = vec4(color, 1.0);
      }
    `,
  })

  const envMesh = new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), envMat)
  envScene.add(envMesh)

  const envMap = pmrem.fromScene(envScene, 0, 0.1, 100).texture
  envMat.dispose()
  envMesh.geometry.dispose()
  pmrem.dispose()

  return envMap
}
