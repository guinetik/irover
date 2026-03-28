uniform sampler2D tDiffuse;
uniform float uRadiationLevel;
uniform float uTime;
uniform vec2 uResolution;

varying vec2 vUv;

// Simple hash — no external includes
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float hash1(float v) {
  return fract(sin(v * 74.3219) * 93856.1247);
}

void main() {
  // Pass-through below threshold — safe zones get a clean signal
  vec4 color = texture2D(tDiffuse, vUv);

  // radStrength is 0.0 below 0.25 (clean pass) and ramps to 1.0 at max hazard
  float radStrength = smoothstep(0.25, 1.0, uRadiationLevel);

  if (radStrength <= 0.0) {
    gl_FragColor = color;
    return;
  }

  // ── 1. Green shadow push ─────────────────────────────────────────────────
  // Tint shadows and midtones with a sickly green — luminance-masked so
  // bright highlights stay clean.
  float lum = dot(color.rgb, vec3(0.299, 0.587, 0.114));
  float shadowMask = 1.0 - smoothstep(0.4, 0.85, lum); // strong in darks, fades in brights
  vec3 radTint = vec3(0.1, 0.6, 0.3);
  color.rgb = mix(color.rgb, radTint, shadowMask * radStrength * 0.35);

  // ── 2. Fast thin scanlines (scrolling upward) ────────────────────────────
  // Very fine, ~10% opacity — glows green on alternating rows.
  float scanSpeed   = 1.8; // upward scroll rate (UV/sec)
  float scanFreq    = uResolution.y * 0.85; // thin lines
  float scanPhase   = vUv.y + uTime * scanSpeed;
  float rawScan     = sin(scanPhase * scanFreq) * 0.5 + 0.5;
  float scanLine    = pow(rawScan, 8.0); // sharp — not soft
  float scanOpacity = radStrength * 0.10;
  color.rgb += vec3(0.0, scanLine, 0.15 * scanLine) * scanOpacity;

  // ── 3. Hot pixel clusters ────────────────────────────────────────────────
  // Single-frame bright green dots. Rare at low rad, dense at max.
  // Frame key snaps every ~1/15 s so dots flicker individually.
  float frameKey   = floor(uTime * 15.0);
  vec2  pixelCoord = floor(vUv * uResolution);
  float pixHash    = hash(pixelCoord * 0.01 + vec2(frameKey * 0.371, frameKey * 0.618));
  float hotThresh  = mix(0.996, 0.960, radStrength * radStrength);
  float hotPixel   = step(hotThresh, pixHash);
  float hotBright  = mix(0.5, 1.2, hash(pixelCoord * 0.02 + frameKey));
  color.rgb += vec3(0.05, hotBright, 0.15) * hotPixel;

  // ── 4. Static snow band (hazardous only, radStrength > 0.5) ─────────────
  // A drifting band of green-tinted noise like a bad CRT signal.
  if (radStrength > 0.5) {
    float bandIntensity = smoothstep(0.5, 1.0, radStrength);
    float bandSpeed     = 0.25 * bandIntensity;
    float bandPos       = fract(vUv.y - uTime * bandSpeed);
    float bandEnvelope  = smoothstep(0.55, 0.35, bandPos)
                        * smoothstep(0.0,  0.15, bandPos);
    float snowFrame     = floor(uTime * 20.0);
    float snowNoise     = (hash(vUv * uResolution * 0.9 + snowFrame) - 0.5)
                        * bandEnvelope * bandIntensity * 0.55;
    color.rgb += vec3(0.0, snowNoise, snowNoise * 0.25);
  }

  // ── 5. Reversed chromatic aberration (radStrength > 0.4) ────────────────
  // Green channel displaces OUTWARD while red/blue stay put.
  // We only offset green — don't re-read red/blue from tDiffuse, which
  // would undo tint/scanlines/hot-pixels already baked into `color`.
  if (radStrength > 0.4) {
    float caStrength = smoothstep(0.4, 1.0, radStrength) * 0.006;
    vec2  centered   = vUv - 0.5;
    float r2         = dot(centered, centered);
    vec2  caDir      = centered * (caStrength + r2 * 0.004);
    float gDisplaced = texture2D(tDiffuse, vUv + caDir).g;
    color.g = mix(color.g, gDisplaced, smoothstep(0.4, 1.0, radStrength) * 0.5);
  }

  // ── 6. Full-frame green flash (uRadiationLevel > 0.85) ──────────────────
  // Rare 1-2 frame flash that washes the entire screen with bright green.
  // Probability ≈ 0.4 % per frame at max level → averages ~1 per 250 frames.
  if (uRadiationLevel > 0.85) {
    float flashStrength = smoothstep(0.85, 1.0, uRadiationLevel);
    float flashFrame    = floor(uTime * 60.0); // 60 fps bucket
    float flashRoll     = hash1(flashFrame);
    float flashThresh   = mix(0.996, 0.990, flashStrength);
    float flashOn       = step(flashThresh, flashRoll);
    // Two-frame duration: also check previous frame bucket
    float flashRollPrev = hash1(flashFrame - 1.0);
    flashOn = max(flashOn, step(flashThresh, flashRollPrev));
    color.rgb = mix(color.rgb, vec3(0.05, 0.85, 0.20), flashOn * flashStrength * 0.55);
  }

  // ── 7. Vignette tightening ───────────────────────────────────────────────
  // Rad hazard darkens the screen edges more than normal — claustrophobic feel.
  vec2 centered = vUv - 0.5;
  float vigDist = length(centered) * 2.0;
  float vigBase  = smoothstep(0.5, 1.5, vigDist) * 0.25;         // baseline (no rad)
  float vigExtra = smoothstep(0.4, 1.3, vigDist) * radStrength * 0.30; // extra tightening
  color.rgb *= 1.0 - vigBase - vigExtra;

  gl_FragColor = color;
}
