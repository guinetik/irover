import { describe, it, expect } from 'vitest'
import atmosphereVert from '../shaders/atmosphere.vert.glsl?raw'
import atmosphereFrag from '../shaders/atmosphere.frag.glsl?raw'

describe('GLSL shaders', () => {
  it('atmosphere vertex shader is non-empty and contains main()', () => {
    expect(atmosphereVert).toBeTruthy()
    expect(atmosphereVert).toContain('void main()')
    expect(atmosphereVert).toContain('vNormal')
    expect(atmosphereVert).toContain('vWorldPosition')
  })

  it('atmosphere fragment shader is non-empty and contains main()', () => {
    expect(atmosphereFrag).toBeTruthy()
    expect(atmosphereFrag).toContain('void main()')
    expect(atmosphereFrag).toContain('uAtmosphereColor')
    expect(atmosphereFrag).toContain('uFresnelPower')
  })
})
