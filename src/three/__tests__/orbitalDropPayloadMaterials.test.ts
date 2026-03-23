import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { applyOrbitalDropLuxuryMaterialPass } from '../orbitalDrop/orbitalDropPayloadModel'

describe('applyOrbitalDropLuxuryMaterialPass', () => {
  it('brightens and polishes standard payload materials', () => {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({
        color: new THREE.Color(0.4, 0.35, 0.3),
        roughness: 0.9,
        metalness: 0.05,
        emissive: new THREE.Color(0x000000),
        emissiveIntensity: 0,
      }),
    )

    applyOrbitalDropLuxuryMaterialPass(mesh)

    const material = mesh.material as THREE.MeshStandardMaterial
    expect(material.roughness).toBeLessThan(0.9)
    expect(material.metalness).toBeGreaterThan(0.05)
    expect(material.emissiveIntensity).toBeGreaterThan(0)
    expect(material.color.r).toBeGreaterThan(0.4)
  })
})
