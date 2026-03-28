import * as THREE from "three";
import * as BufferGeometryUtils from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { SimplexNoise } from "@/lib/math/simplexNoise";
import type { TerrainParams } from "@/types/terrain";
export type { TerrainParams, TerrainFeatureType } from "@/types/terrain";
import { pickDetailTextures } from "@/lib/terrain/detailTextures";
import terrainVert from "@/three/shaders/terrain.vert.glsl?raw";
import terrainFrag from "@/three/shaders/terrain.frag.glsl?raw";
import mountainVert from "@/three/shaders/mountain.vert.glsl?raw";
import mountainFrag from "@/three/shaders/mountain.frag.glsl?raw";
import rockTextureUrl from "@/assets/texture1.jpg?url";
import dustTextureUrl from "@/assets/texture2.jpg?url";
import { RockFactory, type RockCollider } from "./RockFactory";
import { GlbTerrainGenerator } from "./GlbTerrainGenerator";
import { MarsGlobalTerrainGenerator } from "./MarsGlobalTerrainGenerator";
import { ElevationTerrainGenerator } from "./ElevationTerrainGenerator";
import { generateMapCanvas, MARS_COLOR_RAMP, HYPSOMETRIC_RAMP } from '@/lib/terrain/mapColors'

const GRID_SIZE = 256;

import { TERRAIN_SCALE } from './terrainConstants'
export { TERRAIN_SCALE } from './terrainConstants'
const SCALE = TERRAIN_SCALE;

/** Common interface for all terrain generators. */
export interface ITerrainGenerator {
  readonly group: THREE.Group
  readonly rockSpawner: RockFactory
  terrainMaterial: THREE.ShaderMaterial | null
  get rockColliders(): RockCollider[]
  get scale(): number
  generate(params: TerrainParams): Promise<void>
  heightAt(x: number, z: number): number
  terrainHeightAt(x: number, z: number): number
  normalAt(x: number, z: number): THREE.Vector3
  slopeAt(x: number, z: number): number
  getSmallRocks(): THREE.Mesh[]
  dispose(): void
  /** 2D color map canvas (Mars terracotta ramp), available after generate(). */
  readonly mapCanvasMars: HTMLCanvasElement | null
  /** 2D color map canvas (hypsometric blue-red ramp), available after generate(). */
  readonly mapCanvasHypso: HTMLCanvasElement | null
}

export type TerrainGeneratorType = 'default' | 'glb' | 'mars-global' | 'elevation'

/** Creates a terrain generator by type. */
export function createTerrainGenerator(type: TerrainGeneratorType = 'default'): ITerrainGenerator {
  if (type === 'elevation') return new ElevationTerrainGenerator()
  if (type === 'mars-global') return new MarsGlobalTerrainGenerator()
  if (type === 'glb') return new GlbTerrainGenerator()
  return new DefaultTerrainGenerator()
}

export class DefaultTerrainGenerator implements ITerrainGenerator {
  private heightmap: Float32Array | null = null;
  private heightMin = 0;
  private heightMax = 0;
  private terrainMesh: THREE.Mesh | null = null;
  /** Exposed for dynamic sun direction updates */
  terrainMaterial: THREE.ShaderMaterial | null = null;
  mapCanvasMars: HTMLCanvasElement | null = null
  mapCanvasHypso: HTMLCanvasElement | null = null
  private mountains: THREE.Mesh[] = [];
  private textures: THREE.Texture[] = [];

  /** Rock/boulder spawner — owns geometry pools, materials, and placement. */
  readonly rockSpawner = new RockFactory();

  /** Rock positions, radii, and heights for collision/climbing */
  get rockColliders() {
    return this.rockSpawner.colliders;
  }

  readonly group = new THREE.Group();

  async generate(params: TerrainParams) {
    this.dispose();

    await this.rockSpawner.ready();

    this.heightmap = this.genHeightmap(params);

    // Compute height range for shader normalization
    this.heightMin = Infinity;
    this.heightMax = -Infinity;
    for (let i = 0; i < this.heightmap.length; i++) {
      if (this.heightmap[i] < this.heightMin)
        this.heightMin = this.heightmap[i];
      if (this.heightmap[i] > this.heightMax)
        this.heightMax = this.heightmap[i];
    }

    this.mapCanvasMars = generateMapCanvas(this.heightmap!, GRID_SIZE, this.heightMin, this.heightMax, MARS_COLOR_RAMP)
    this.mapCanvasHypso = generateMapCanvas(this.heightmap!, GRID_SIZE, this.heightMin, this.heightMax, HYPSOMETRIC_RAMP)

    this.buildTerrainMesh(params);
    this.rockSpawner.spawn(
      params,
      (x, z) => this.terrainHeightAt(x, z),
      this.group,
    );
    this.buildMountains(params);
  }

  private genHeightmap(p: TerrainParams): Float32Array {
    const sn = new SimplexNoise(p.seed);
    const sn2 = new SimplexNoise(p.seed + 50);
    const sn3 = new SimplexNoise(p.seed + 150);
    const d = new Float32Array(GRID_SIZE * GRID_SIZE);
    const {
      roughness: ro,
      craterDensity: cr,
      dustCover: dc,
      elevation: el,
      featureType: ft,
    } = p;

    // High-roughness fine-grit amplification (>0.7 → double the fine octaves)
    const highRough = ro > 0.7;
    const fineAmp = highRough ? 2.0 : 1.0;

    // ----------------------------------------------------------------
    // Per-pixel terrain shape
    // ----------------------------------------------------------------
    for (let y = 0; y < GRID_SIZE; y++) {
      for (let x = 0; x < GRID_SIZE; x++) {
        const nx = x / GRID_SIZE - 0.5; // -0.5 … +0.5
        const ny = y / GRID_SIZE - 0.5;
        // Radial distance from map centre (0 at centre, ~0.707 at corner)
        const nr = Math.sqrt(nx * nx + ny * ny);

        let h = 0;

        // ----------------------------------------------------------------
        // VOLCANO — shield dome, lava channels, collapsed tubes
        // ----------------------------------------------------------------
        if (ft === "volcano") {
          // Broad shield dome: smooth parabolic rise toward centre
          const dome = Math.max(0, 1 - nr * 2.8);
          h += dome * dome * el * 30;

          // Large-scale undulation riding the dome
          h += sn.n2(nx * 1.5, ny * 1.5) * el * 6;
          h += sn2.n2(nx * 3, ny * 3) * el * 4;

          // Lava channels — long sinuous valleys via abs(noise) along dominant axis
          const lavaChannel = Math.abs(sn3.n2(nx * 4 + 5, ny * 1.5)) * el * -8;
          h += lavaChannel;
          const lavaChannel2 =
            Math.abs(sn3.n2(nx * 1.5 + 9, ny * 3.5 + 2)) * el * -4;
          h += lavaChannel2;

          // Collapsed lava tubes — narrow linear depressions
          const tube = sn.n2(nx * 12, ny * 2.5 + 3);
          if (tube > 0.6) h -= (tube - 0.6) * ro * 8;

          // Medium-scale undulation (volcanic surface is younger, more rolling)
          h += sn.n2(nx * 5, ny * 5) * el * 3;
          h += sn2.n2(nx * 8, ny * 8) * ro * 2.5;

          // Fine rocky detail (reduced — younger, less cratered surface)
          h += sn.n2(nx * 15, ny * 15) * ro * 2;
          h += sn2.n2(nx * 30, ny * 30) * ro * fineAmp * 0.8;
          h += sn.n2(nx * 60, ny * 60) * ro * fineAmp * 0.4;

          // ----------------------------------------------------------------
          // CANYON — deep channels, cliff terracing, knife-edge ridges
          // ----------------------------------------------------------------
        } else if (ft === "canyon") {
          // Elevated plateau base; elevation effect doubled for dramatic height range
          h += sn.n2(nx * 1.2, ny * 1.2) * el * 28;
          h += sn2.n2(nx * 2.5, ny * 2.5) * el * 14;

          // Carve 3 major canyon channels with strongly directional noise
          const ch1 = sn3.n2(ny * 3.5, nx * 0.4 + 1);
          if (ch1 > 0.15) h -= (ch1 - 0.15) * (el + 0.5) * 55;
          const ch2 = sn3.n2((nx + ny) * 2.2 + 5, (ny - nx) * 0.5 + 3);
          if (ch2 > 0.25) h -= (ch2 - 0.25) * (el + 0.4) * 35;
          const ch3 = sn2.n2(ny * 5 + 7, nx * 0.6 + 4);
          if (ch3 > 0.35) h -= (ch3 - 0.35) * (el + 0.3) * 22;

          // Terracing — step-like cliff ledges blended with smooth h
          const steps = 5;
          const hStepped = Math.floor(h / steps) * steps;
          h = h * 0.55 + hStepped * 0.45;

          // Knife-edge ridges when roughness is high
          if (highRough) {
            h += Math.abs(sn.n2(nx * 7 + 10, ny * 7 + 10)) * ro * 10;
            h += Math.abs(sn2.n2(nx * 12 + 3, ny * 5 + 8)) * ro * 6;
          } else {
            h += Math.abs(sn.n2(nx * 7 + 10, ny * 7 + 10)) * ro * 4;
          }

          // Fine detail
          h += sn.n2(nx * 20, ny * 20) * ro * fineAmp * 3;
          h += sn2.n2(nx * 40, ny * 40) * ro * fineAmp * 1.5;

          // ----------------------------------------------------------------
          // POLAR CAP — smooth ice, polygon cracks, spiral troughs, dunes
          // ----------------------------------------------------------------
        } else if (ft === "polar-cap") {
          const iceAmp = 0.4; // 60 % reduction on all noise amplitudes

          // Very gentle large-scale relief
          h += sn.n2(nx * 1.0, ny * 1.0) * el * 5 * iceAmp;
          h += sn2.n2(nx * 2.5, ny * 2.5) * el * 3 * iceAmp;

          // Spiral trough terracing (polar layered deposits)
          const spiralAngle = Math.atan2(ny, nx) * 2 + nr * 8;
          const trough = Math.sin(spiralAngle) * 0.5 + 0.5;
          h -= trough * trough * el * 4 * iceAmp;

          // Polygonal cracking — Voronoi-like raised ridges at cell boundaries
          const cellFreq = 8;
          const cellNx = Math.floor(nx * cellFreq + 0.5) / cellFreq;
          const cellNy = Math.floor(ny * cellFreq + 0.5) / cellFreq;
          const cellDist =
            Math.sqrt(Math.pow(nx - cellNx, 2) + Math.pow(ny - cellNy, 2)) *
            cellFreq;
          const polyRidge = Math.exp(-Math.pow((cellDist - 0.45) * 8, 2));
          h += polyRidge * el * 1.5 * iceAmp;

          // Gentle wind dunes
          h += sn3.n2(nx * 6 + 20, ny * 3) * el * 2.5 * iceAmp;
          h += sn3.n2(nx * 3 + 10, ny * 6 + 5) * el * 1.5 * iceAmp;

          // Very subtle fine texture
          h += sn.n2(nx * 20, ny * 20) * ro * fineAmp * 0.5 * iceAmp;
          h += sn2.n2(nx * 50, ny * 50) * ro * fineAmp * 0.25 * iceAmp;

          // ----------------------------------------------------------------
          // PLAIN — flat with yardangs and shallow depressions
          // ----------------------------------------------------------------
        } else if (ft === "plain") {
          // Mostly flat, gentle undulation
          h += sn.n2(nx * 1.0, ny * 1.0) * el * 6;
          h += sn2.n2(nx * 2.5, ny * 2.5) * el * 3;

          // Yardangs — wind-carved linear features, stretched along one axis
          h += sn3.n2(nx * 8, ny * 2.5) * ro * 3.5;
          h += sn3.n2(nx * 12 + 4, ny * 2 + 3) * ro * 2.0;

          // Occasional shallow depressions
          const dep2 = sn.n2(nx * 4 + 7, ny * 4 + 7);
          if (dep2 < -0.4) h += (dep2 + 0.4) * el * 4;

          // Medium rocky detail
          h += sn.n2(nx * 10, ny * 10) * ro * 3;
          h += sn2.n2(nx * 20, ny * 20) * ro * fineAmp * 1.5;
          h += sn.n2(nx * 45, ny * 45) * ro * fineAmp * 0.7;

          // Mild ridge lines
          h += Math.abs(sn.n2(nx * 5 + 10, ny * 5 + 10)) * el * 1.5;

          // ----------------------------------------------------------------
          // BASIN — bowl shape, ancient heavily cratered floor
          // ----------------------------------------------------------------
        } else if (ft === "basin") {
          // Broad parabolic bowl depression
          h -= nr * nr * el * 40;

          // Ancient heavily deformed floor noise
          h += sn.n2(nx * 1.5, ny * 1.5) * el * 10;
          h += sn2.n2(nx * 3, ny * 3) * el * 6;
          h += sn3.n2(nx * 6, ny * 6) * el * 3;

          // Rough cratered texture
          h += sn.n2(nx * 10, ny * 10) * ro * 6;
          h += sn2.n2(nx * 20, ny * 20) * ro * fineAmp * 3.5;
          h += sn.n2(nx * 40, ny * 40) * ro * fineAmp * 2;

          // Ancient ridge lines
          h += Math.abs(sn.n2(nx * 6 + 10, ny * 6 + 10)) * el * 4;
          if (highRough) {
            h += Math.abs(sn3.n2(nx * 10 + 5, ny * 10 + 5)) * ro * 5;
          }

          // ----------------------------------------------------------------
          // LANDING-SITE / default — original rolling terrain
          // ----------------------------------------------------------------
        } else {
          h += sn.n2(nx * 1.5, ny * 1.5) * el * 15;
          h += sn.n2(nx * 3, ny * 3) * el * 8;
          h += sn2.n2(nx * 5, ny * 5) * el * 4;
          h += sn.n2(nx * 10, ny * 10) * ro * 5;
          h += sn2.n2(nx * 20, ny * 20) * ro * 3;
          h += sn.n2(nx * 40, ny * 40) * ro * 1.5;
          h += sn2.n2(nx * 80, ny * 80) * ro * fineAmp * 0.5;
          h += Math.abs(sn.n2(nx * 6 + 10, ny * 6 + 10)) * el * 3;
        }

        d[y * GRID_SIZE + x] = h;
      }
    }

    // ----------------------------------------------------------------
    // CRATERS — feature-type counts, large craters, secondary craters
    // ----------------------------------------------------------------
    const rng = new SimplexNoise(p.seed + 100);
    const rng2 = new SimplexNoise(p.seed + 400);
    // High-roughness: crater rims are more pronounced
    const rimMult = highRough ? 2.0 : 1.0;

    // Base crater count and scaling per feature type
    let craterCount = Math.floor(cr * 20) + 3;
    let largeCraterCount = 0;
    let craterSizeMult = 1.0;

    if (ft === "volcano") {
      // Young volcanic surface — far fewer craters
      craterCount = Math.max(1, Math.floor(craterCount * 0.3));
      craterSizeMult = 0.7;
    } else if (ft === "canyon") {
      craterCount = Math.floor(craterCount * 0.6);
    } else if (ft === "polar-cap") {
      // Ice resurfaces — almost none
      craterCount = Math.max(0, Math.floor(craterCount * 0.15));
      craterSizeMult = 0.5;
    } else if (ft === "basin") {
      // Ancient, heavily cratered floor
      craterCount = Math.floor(craterCount * 1.8) + 5;
      largeCraterCount = Math.floor(cr * 4) + 2;
      craterSizeMult = 1.4;
    } else if (ft === "plain") {
      largeCraterCount = Math.floor(cr * 2);
    }

    // Helper: stamp one crater at normalised (cx, cy) with given radius and depth
    const stampCrater = (cx: number, cy: number, rad: number, dep: number) => {
      const xMin = Math.max(0, Math.floor((cx - rad * 2.5) * GRID_SIZE));
      const xMax = Math.min(
        GRID_SIZE - 1,
        Math.ceil((cx + rad * 2.5) * GRID_SIZE),
      );
      const yMin = Math.max(0, Math.floor((cy - rad * 2.5) * GRID_SIZE));
      const yMax = Math.min(
        GRID_SIZE - 1,
        Math.ceil((cy + rad * 2.5) * GRID_SIZE),
      );
      for (let py = yMin; py <= yMax; py++) {
        for (let px = xMin; px <= xMax; px++) {
          const dx2 = px / GRID_SIZE - cx;
          const dy2 = py / GRID_SIZE - cy;
          const dist = Math.sqrt(dx2 * dx2 + dy2 * dy2);
          if (dist < rad * 2.5) {
            const t = dist / rad;
            const rimExp = Math.exp(-Math.pow((t - 1) * 3.5, 2));
            if (t < 1) {
              // Flat floor using pow(t, 2) instead of t*t
              d[py * GRID_SIZE + px] += (Math.pow(t, 2) - 1) * dep;
              d[py * GRID_SIZE + px] += rimExp * dep * 0.5 * rimMult;
            } else if (t < 2.5) {
              d[py * GRID_SIZE + px] += rimExp * dep * 0.5 * rimMult;
            }
          }
        }
      }
    };

    // Standard craters
    for (let c = 0; c < craterCount; c++) {
      const cx = (rng.n2(c * 7.3, 0.5) + 1) * 0.5;
      const cy = (rng.n2(0.5, c * 7.3) + 1) * 0.5;
      const rad =
        (0.02 + (rng.n2(c * 3.1, c * 2.7) + 1) * 0.05 * cr) * craterSizeMult;
      const dep = (5 + cr * 12) * (highRough ? 1.5 : 1.0);
      stampCrater(cx, cy, rad, dep);
    }

    // Large craters (radius 0.08–0.15) for high craterDensity sites
    for (let c = 0; c < largeCraterCount; c++) {
      const cx = (rng2.n2(c * 5.1, 1.3) + 1) * 0.5;
      const cy = (rng2.n2(1.3, c * 5.1) + 1) * 0.5;
      const rad =
        (0.08 + (rng2.n2(c * 2.3, c * 1.9) + 1) * 0.035) * craterSizeMult;
      const dep = (10 + cr * 20) * (highRough ? 1.5 : 1.0);
      stampCrater(cx, cy, rad, dep);

      // Secondary craters scattered around large crater rims
      const secCount = 3 + Math.floor(cr * 4);
      for (let s = 0; s < secCount; s++) {
        const angle = rng2.n2(c * 3.7 + s * 1.1, s * 2.3) * Math.PI * 2;
        const rimDist = rad * (1.3 + (rng2.n2(s * 1.9, c * 2.7) + 1) * 0.6);
        const scx = Math.max(
          0.01,
          Math.min(0.99, cx + Math.cos(angle) * rimDist),
        );
        const scy = Math.max(
          0.01,
          Math.min(0.99, cy + Math.sin(angle) * rimDist),
        );
        const srad = rad * (0.08 + (rng2.n2(s * 3.3, c * 1.7) + 1) * 0.06);
        stampCrater(scx, scy, srad, dep * 0.35);
      }
    }

    // Extra ridge pass for high-roughness sites
    if (highRough) {
      for (let y2 = 0; y2 < GRID_SIZE; y2++) {
        for (let x2 = 0; x2 < GRID_SIZE; x2++) {
          const nx2 = x2 / GRID_SIZE - 0.5;
          const ny2 = y2 / GRID_SIZE - 0.5;
          d[y2 * GRID_SIZE + x2] +=
            Math.abs(sn3.n2(nx2 * 14 + 20, ny2 * 14 + 20)) * ro * 4;
        }
      }
    }

    // ----------------------------------------------------------------
    // DUST SMOOTHING
    // ----------------------------------------------------------------
    // Polar caps always get forced extra smoothing; others follow dust cover
    const smoothPasses =
      ft === "polar-cap"
        ? Math.max(4, Math.floor(dc * 5))
        : dc > 0.3
          ? Math.floor(dc * 3)
          : 0;

    for (let q = 0; q < smoothPasses; q++) {
      const cp = new Float32Array(d);
      for (let y2 = 1; y2 < GRID_SIZE - 1; y2++) {
        for (let x2 = 1; x2 < GRID_SIZE - 1; x2++) {
          d[y2 * GRID_SIZE + x2] =
            (cp[y2 * GRID_SIZE + x2] * 2 +
              cp[(y2 - 1) * GRID_SIZE + x2] +
              cp[(y2 + 1) * GRID_SIZE + x2] +
              cp[y2 * GRID_SIZE + x2 - 1] +
              cp[y2 * GRID_SIZE + x2 + 1]) /
            6;
        }
      }
    }

    return d;
  }

  private buildTerrainMesh(p: TerrainParams) {
    const hm = this.heightmap!;
    const geo = new THREE.PlaneGeometry(
      SCALE,
      SCALE,
      GRID_SIZE - 1,
      GRID_SIZE - 1,
    );
    geo.rotateX(-Math.PI / 2);

    const pos = geo.attributes.position.array as Float32Array;
    for (let i = 0; i < GRID_SIZE * GRID_SIZE; i++) {
      pos[i * 3 + 1] = hm[i];
    }

    geo.computeVertexNormals();

    const textureLoader = new THREE.TextureLoader();

    const rockTex = textureLoader.load(rockTextureUrl);
    rockTex.wrapS = rockTex.wrapT = THREE.RepeatWrapping;
    rockTex.minFilter = THREE.LinearMipmapLinearFilter;
    rockTex.magFilter = THREE.LinearFilter;
    rockTex.anisotropy = 4;

    const dustTex = textureLoader.load(dustTextureUrl);
    dustTex.wrapS = dustTex.wrapT = THREE.RepeatWrapping;
    dustTex.minFilter = THREE.LinearMipmapLinearFilter;
    dustTex.magFilter = THREE.LinearFilter;
    dustTex.anisotropy = 4;

    this.textures = [rockTex, dustTex];

    // Site-specific orbital texture (from public/{siteId}.jpg)
    // Provides macro color variation from real NASA imagery
    const siteTex = textureLoader.load(
      `/${p.siteId}.jpg`,
      undefined,
      undefined,
      () => {
        // Texture not found — set a flag to skip in shader
        material.uniforms.uHasSiteTexture.value = 0.0;
      },
    );
    siteTex.wrapS = siteTex.wrapT = THREE.RepeatWrapping;
    siteTex.minFilter = THREE.LinearMipmapLinearFilter;
    siteTex.magFilter = THREE.LinearFilter;
    siteTex.anisotropy = 4;
    this.textures.push(siteTex);

    // Two geology-driven detail textures for patchy variety
    const [detailUrl1, detailUrl2] = pickDetailTextures(p);
    const detailTexA = textureLoader.load(detailUrl1);
    detailTexA.wrapS = detailTexA.wrapT = THREE.RepeatWrapping;
    detailTexA.minFilter = THREE.LinearMipmapLinearFilter;
    detailTexA.magFilter = THREE.LinearFilter;
    detailTexA.anisotropy = 4;
    const detailTexB = textureLoader.load(detailUrl2);
    detailTexB.wrapS = detailTexB.wrapT = THREE.RepeatWrapping;
    detailTexB.minFilter = THREE.LinearMipmapLinearFilter;
    detailTexB.magFilter = THREE.LinearFilter;
    detailTexB.anisotropy = 4;
    this.textures.push(detailTexA, detailTexB);

    const sunDir = new THREE.Vector3(50, 80, 30).normalize();

    const material = new THREE.ShaderMaterial({
      uniforms: {
        uDustCover: { value: p.dustCover },
        uIronOxide: { value: p.ironOxide },
        uBasalt: { value: p.basalt },
        uRoughness: { value: p.roughness },
        uCraterDensity: { value: p.craterDensity },
        uSunDirection: { value: sunDir },
        uHeightMin: { value: this.heightMin },
        uHeightRange: { value: this.heightMax - this.heightMin },
        uRockTexture: { value: rockTex },
        uDustTexture: { value: dustTex },
        uDetailTexA: { value: detailTexA },
        uDetailTexB: { value: detailTexB },
        uSiteTexture: { value: siteTex },
        uHasSiteTexture: { value: 1.0 },
        uWaterIce: { value: p.waterIceIndex },
        uTemperature: {
          value: Math.max(0, Math.min(1, (p.temperatureMaxK - 150) / 150)),
        },
        uSilicate: { value: p.silicateIndex },
      },
      vertexShader: terrainVert,
      fragmentShader: terrainFrag,
    });

    this.terrainMaterial = material;
    this.terrainMesh = new THREE.Mesh(geo, material);
    this.terrainMesh.receiveShadow = true;
    this.group.add(this.terrainMesh);
  }

  private buildMountains(params: TerrainParams) {
    const { seed, elevation, featureType, waterIceIndex } = params;
    const rng = new SimplexNoise(seed + 300);
    const elev = Math.max(0.25, elevation);

    // Site-aware color palettes
    let baseColor: THREE.Color;
    let peakColor: THREE.Color;
    let hazeColor: THREE.Color;
    if (waterIceIndex > 0.7) {
      baseColor = new THREE.Color(0x6a7888);
      peakColor = new THREE.Color(0xa0b0c0);
      hazeColor = new THREE.Color(0x8098a8);
    } else if (featureType === 'volcano') {
      baseColor = new THREE.Color(0x4a3028);
      peakColor = new THREE.Color(0x6a5040);
      hazeColor = new THREE.Color(0x2a1810);
    } else if (featureType === 'canyon') {
      baseColor = new THREE.Color(0x7a4830);
      peakColor = new THREE.Color(0xa07858);
      hazeColor = new THREE.Color(0x4a2818);
    } else {
      baseColor = new THREE.Color(0x6a4830);
      peakColor = new THREE.Color(0x9a7858);
      hazeColor = new THREE.Color(0x3a2010);
    }

    const sunDir = new THREE.Vector3(50, 80, 30).normalize();

    // Create shader materials for each ring distance
    const createMountainMat = (hazeStart: number, hazeEnd: number, maxH: number) =>
      new THREE.ShaderMaterial({
        uniforms: {
          uBaseColor: { value: baseColor },
          uPeakColor: { value: peakColor },
          uHazeColor: { value: hazeColor },
          uSunDirection: { value: sunDir },
          uMaxHeight: { value: maxH },
          uHazeStart: { value: hazeStart },
          uHazeEnd: { value: hazeEnd },
        },
        vertexShader: mountainVert,
        fragmentShader: mountainFrag,
        fog: false,
      });

    const nearMat = createMountainMat(SCALE * 0.5, SCALE * 0.9, 100);
    const midMat = createMountainMat(SCALE * 0.4, SCALE * 0.85, 130);
    const farMat = createMountainMat(SCALE * 0.3, SCALE * 0.8, 160);

    // Helper to place one mountain
    const placeMountain = (
      angle: number,
      dist: number,
      height: number,
      width: number,
      mat: THREE.ShaderMaterial,
      idx: number,
    ) => {
      const mx = Math.cos(angle) * dist;
      const mz = Math.sin(angle) * dist;
      const geo = this.buildMountainGeo(rng, idx, width, height, 5);
      const m = new THREE.Mesh(geo, mat);
      m.position.set(mx, -height * 0.1, mz);
      m.rotation.y = rng.n2(idx * 5.3, idx * 2.1) * Math.PI * 2;
      m.castShadow = false;
      m.receiveShadow = false;
      this.group.add(m);
      this.mountains.push(m);
    };

    // --- Inner ring: dense wall of overlapping peaks ---
    const innerCount = 28 + Math.floor(elev * 16);
    const innerRadius = SCALE * 0.52;

    for (let i = 0; i < innerCount; i++) {
      const angle = (i / innerCount) * Math.PI * 2 + rng.n2(i * 3.1, 0) * 0.25;
      const dist = innerRadius + rng.n2(0, i * 2.7) * SCALE * 0.08;

      const hs = (rng.n2(i * 1.3, i * 0.7) + 1) * 0.5;
      const height = 30 + hs * 70 * elev;
      const width = 50 + (rng.n2(i * 0.9, i * 1.5) + 1) * 35;

      placeMountain(angle, dist, height, width, nearMat, i);
    }

    // --- Mid ring: fills gap, wider bases for solid ridgeline ---
    const midCount = 22 + Math.floor(elev * 12);
    const midRadius = SCALE * 0.65;

    for (let i = 0; i < midCount; i++) {
      const angle = (i / midCount) * Math.PI * 2 + rng.n2(i * 4.3, 0.5) * 0.3;
      const dist = midRadius + rng.n2(0.5, i * 3.1) * SCALE * 0.08;

      const hs = (rng.n2(i * 1.7, i * 1.1) + 1) * 0.5;
      const height = 50 + hs * 80 * elev;
      const width = 60 + (rng.n2(i * 1.3, i * 0.9) + 1) * 40;

      placeMountain(angle, dist, height, width, midMat, i + 200);
    }

    // --- Outer ring: dramatic backdrop, tallest peaks ---
    const outerCount = 18 + Math.floor(elev * 10);
    const outerRadius = SCALE * 0.8;

    for (let i = 0; i < outerCount; i++) {
      const angle = (i / outerCount) * Math.PI * 2 + rng.n2(i * 5.7, 1.3) * 0.3;
      const dist = outerRadius + rng.n2(1.3, i * 3.1) * SCALE * 0.1;

      const hs = (rng.n2(i * 2.1, i * 1.3) + 1) * 0.5;
      const height = 80 + hs * 80 * elev;
      const width = 70 + (rng.n2(i * 1.1, i * 0.7) + 1) * 50;

      placeMountain(angle, dist, height, width, farMat, i + 400);
    }

    // --- Gap-filler peaks: scattered between rings to close holes ---
    const fillerCount = 16 + Math.floor(elev * 8);
    const fillerRng = new SimplexNoise(seed + 350);

    for (let i = 0; i < fillerCount; i++) {
      const angle = fillerRng.n2(i * 2.9, 0.3) * Math.PI * 2;
      const dist = SCALE * (0.55 + (fillerRng.n2(0.3, i * 2.9) + 1) * 0.15);

      const height = 25 + (fillerRng.n2(i * 1.5, i * 0.9) + 1) * 35 * elev;
      const width = 40 + (fillerRng.n2(i * 0.7, i * 1.3) + 1) * 30;

      const mat = dist < SCALE * 0.63 ? nearMat : midMat;
      placeMountain(angle, dist, height, width, mat, i + 600);
    }
  }

  /** Build a mountain geometry — 5 shape types with aggressive multi-octave displacement */
  private buildMountainGeo(
    rng: SimplexNoise,
    i: number,
    baseWidth: number,
    peakHeight: number,
    shapeCount: number,
  ): THREE.BufferGeometry {
    const shapeType = i % shapeCount;
    let geo: THREE.BufferGeometry;

    if (shapeType === 0) {
      // Jagged peak — more radial and height segments for smoother silhouette
      geo = new THREE.ConeGeometry(baseWidth, peakHeight, 24, 16);
    } else if (shapeType === 1) {
      // Mesa / butte with steep walls
      geo = new THREE.CylinderGeometry(
        baseWidth * 0.5,
        baseWidth,
        peakHeight * 0.7,
        20,
        12,
      );
    } else if (shapeType === 2) {
      // Broad dome (half-sphere stretched tall)
      geo = new THREE.SphereGeometry(
        baseWidth,
        24,
        16,
        0,
        Math.PI * 2,
        0,
        Math.PI * 0.5,
      );
      geo.scale(1, peakHeight / baseWidth, 1);
    } else if (shapeType === 3) {
      // Twin peaks — two merged cones
      const geo1 = new THREE.ConeGeometry(baseWidth * 0.65, peakHeight, 20, 12);
      const geo2 = new THREE.ConeGeometry(
        baseWidth * 0.55,
        peakHeight * 0.85,
        20,
        12,
      );
      geo2.translate(baseWidth * 0.5, -peakHeight * 0.08, baseWidth * 0.2);
      this.displaceMountainVertices(geo1, baseWidth * 0.25, i);
      this.displaceMountainVertices(geo2, baseWidth * 0.25, i + 50);
      const merged = BufferGeometryUtils.mergeGeometries([geo1, geo2]);
      geo1.dispose();
      geo2.dispose();
      if (!merged) return new THREE.ConeGeometry(baseWidth, peakHeight, 20, 12);
      geo = merged;
      geo.computeVertexNormals();
      return geo;
    } else {
      // Cliff wall / ridge — stretched box
      geo = new THREE.BoxGeometry(
        baseWidth * 2.5,
        peakHeight,
        baseWidth * 0.5,
        16,
        16,
        8,
      );
    }

    this.displaceMountainVertices(geo, baseWidth * 0.25, i);
    geo.computeVertexNormals();
    return geo;
  }

  /**
   * Multi-octave displacement tuned for mountains — produces craggy ridges
   * and cliff faces rather than smooth lumps.
   */
  private displaceMountainVertices(
    geo: THREE.BufferGeometry,
    amount: number,
    seed: number,
  ): void {
    const pos = geo.attributes.position;
    const s = seed * 0.37;
    // Scale frequencies relative to displacement amount so detail matches mountain size
    const freqScale = 1.0 / Math.max(amount, 1);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);

      // Large ridge deformation
      const n1 = Math.sin(x * 0.05 * freqScale + s) * Math.cos(z * 0.04 * freqScale + s * 0.7) * 1.0;
      // Medium crags
      const n2 = Math.sin(x * 0.12 * freqScale + y * 0.08 * freqScale + s * 1.3) *
        Math.cos(z * 0.10 * freqScale + s) * 0.55;
      // Fine jagged detail
      const n3 = Math.sin(x * 0.25 * freqScale + z * 0.22 * freqScale + s * 2.1) *
        Math.cos(y * 0.18 * freqScale + x * 0.15 * freqScale) * 0.3;
      // Very fine erosion texture
      const n4 = Math.sin(x * 0.5 * freqScale + s * 3.1) *
        Math.cos(z * 0.45 * freqScale + y * 0.3 * freqScale) * 0.15;
      // Vertical cliff bands (abs creates sharp edges)
      const cliff = Math.abs(Math.sin(y * 0.08 * freqScale + x * 0.03 * freqScale + s * 0.5)) * 0.35;

      const noise = n1 + n2 + n3 + n4 + cliff;

      // Height-dependent: less displacement near peaks (sharper tips)
      // and at the base (stable ground line)
      const len = Math.sqrt(x * x + z * z) || 1;
      const heightFactor = 0.5 + Math.sin(y * 0.03 + 1.0) * 0.5;

      pos.setX(i, x + (x / len) * noise * amount * heightFactor);
      pos.setY(i, y + noise * amount * 0.25 * heightFactor);
      pos.setZ(i, z + (z / len) * noise * amount * heightFactor);
    }
  }

  /** Bilinear height interpolation at world (x, z), including rock surfaces */
  heightAt(x: number, z: number): number {
    let h = this.terrainHeightAt(x, z);

    // Spatial grid lookup — only checks ~9 nearby cells instead of all 1500 rocks
    const nearby = this.rockSpawner.getCollidersNear(x, z);
    for (const rock of nearby) {
      const dx = x - rock.x;
      const dz = z - rock.z;
      const distSq = dx * dx + dz * dz;
      const r = rock.radius;
      if (distSq < r * r) {
        const t = 1 - distSq / (r * r);
        const rockBaseY = this.terrainHeightAt(rock.x, rock.z);
        const surfaceY = rockBaseY + rock.height * Math.sqrt(t);
        h = Math.max(h, surfaceY);
      }
    }

    return h;
  }

  /** Raw terrain height without rocks */
  terrainHeightAt(x: number, z: number): number {
    if (!this.heightmap) return 0;
    const gx = (x / SCALE + 0.5) * (GRID_SIZE - 1);
    const gz = (z / SCALE + 0.5) * (GRID_SIZE - 1);
    const ix = Math.floor(gx);
    const iz = Math.floor(gz);
    const fx = gx - ix;
    const fz = gz - iz;
    if (ix < 0 || ix >= GRID_SIZE - 1 || iz < 0 || iz >= GRID_SIZE - 1)
      return 0;
    const hm = this.heightmap;
    return (
      hm[iz * GRID_SIZE + ix] * (1 - fx) * (1 - fz) +
      hm[iz * GRID_SIZE + ix + 1] * fx * (1 - fz) +
      hm[(iz + 1) * GRID_SIZE + ix] * (1 - fx) * fz +
      hm[(iz + 1) * GRID_SIZE + ix + 1] * fx * fz
    );
  }

  /** Surface normal at world (x, z) — for tilting objects on terrain */
  normalAt(x: number, z: number): THREE.Vector3 {
    const s = 0.5;
    const hL = this.heightAt(x - s, z);
    const hR = this.heightAt(x + s, z);
    const hD = this.heightAt(x, z - s);
    const hU = this.heightAt(x, z + s);
    return new THREE.Vector3(hL - hR, 2 * s, hD - hU).normalize();
  }

  /** Slope magnitude at world (x, z) */
  slopeAt(x: number, z: number): number {
    const dx = (this.heightAt(x + 1, z) - this.heightAt(x - 1, z)) / 2;
    const dz = (this.heightAt(x, z + 1) - this.heightAt(x, z - 1)) / 2;
    return Math.sqrt(dx * dx + dz * dz);
  }

  get scale(): number {
    return SCALE;
  }

  /** Returns only small rocks (excludes boulders with scale >= 2.0) */
  getSmallRocks(): THREE.Mesh[] {
    return this.rockSpawner.getSmallRocks();
  }

  dispose() {
    if (this.terrainMesh) {
      this.terrainMesh.geometry.dispose();
      (this.terrainMesh.material as THREE.Material).dispose();
    }
    this.textures.forEach((t) => t.dispose());
    this.textures = [];
    this.rockSpawner.clear(this.group);
    this.mountains.forEach((m) => {
      m.geometry.dispose();
      this.group.remove(m);
    });
    this.mountains = [];
    if (this.terrainMesh) this.group.remove(this.terrainMesh);
    this.terrainMesh = null;
    this.terrainMaterial = null;
    this.heightmap = null;
  }
}
