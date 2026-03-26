/**
 * Seeded 2D simplex noise (~[-1, 1]). No Three.js dependency.
 */
const F2 = 0.5 * (Math.sqrt(3) - 1)
const G2 = (3 - Math.sqrt(3)) / 6
const grad3: [number, number][] = [
  [1, 1], [-1, 1], [1, -1], [-1, -1],
  [1, 0], [-1, 0], [0, 1], [0, -1],
]

export class SimplexNoise {
  private perm: Uint8Array
  private pm8: Uint8Array

  constructor(seed: number) {
    this.perm = new Uint8Array(512)
    this.pm8 = new Uint8Array(512)
    const p = new Uint8Array(256)
    for (let i = 0; i < 256; i++) p[i] = i
    let s = Math.abs(seed * 2147483647) || 1
    for (let i = 255; i > 0; i--) {
      s = (s * 16807) % 2147483647
      const j = Math.floor((s / 2147483647) * (i + 1))
      ;[p[i], p[j]] = [p[j], p[i]]
    }
    for (let i = 0; i < 512; i++) {
      this.perm[i] = p[i & 255]
      this.pm8[i] = this.perm[i] % 8
    }
  }

  n2(x: number, y: number): number {
    const s = (x + y) * F2
    const i = Math.floor(x + s)
    const j = Math.floor(y + s)
    const t = (i + j) * G2
    const x0 = x - (i - t)
    const y0 = y - (j - t)
    const i1 = x0 > y0 ? 1 : 0
    const j1 = x0 > y0 ? 0 : 1
    const x1 = x0 - i1 + G2
    const y1 = y0 - j1 + G2
    const x2 = x0 - 1 + 2 * G2
    const y2 = y0 - 1 + 2 * G2
    const ii = i & 255
    const jj = j & 255
    const dot = (gi: number, dx: number, dy: number) =>
      grad3[gi][0] * dx + grad3[gi][1] * dy
    let n0 = 0, n1 = 0, n2 = 0
    let t0 = 0.5 - x0 * x0 - y0 * y0
    if (t0 >= 0) { t0 *= t0; n0 = t0 * t0 * dot(this.pm8[ii + this.perm[jj]], x0, y0) }
    let t1 = 0.5 - x1 * x1 - y1 * y1
    if (t1 >= 0) { t1 *= t1; n1 = t1 * t1 * dot(this.pm8[ii + i1 + this.perm[jj + j1]], x1, y1) }
    let t2 = 0.5 - x2 * x2 - y2 * y2
    if (t2 >= 0) { t2 *= t2; n2 = t2 * t2 * dot(this.pm8[ii + 1 + this.perm[jj + 1]], x2, y2) }
    return 70 * (n0 + n1 + n2)
  }
}
