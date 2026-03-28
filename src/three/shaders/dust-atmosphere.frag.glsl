uniform sampler2D tDiffuse;
uniform float uDustCover;
uniform float uWindSpeed;
uniform float uDustStormLevel;
uniform float uTime;
uniform vec2 uResolution;
/**
 * 0.0–1.0 composite glitch drive — derived from storm level while active.
 * 0 = no storm, 1 = level-5 planet-scale storm.
 */
uniform float uStormGlitchIntensity;
/**
 * 1.0 while FSM is in `incoming` phase (pre-storm signal degradation warning),
 * 0.0 otherwise.
 */
uniform float uStormPhaseIncoming;

varying vec2 vUv;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    v += a * noise(p);
    p *= 2.0;
    a *= 0.5;
  }
  return v;
}

void main() {
  // --- Barrel distortion (subtle drone lens) ---
  vec2 centered = vUv - 0.5;
  float r2 = dot(centered, centered);
  float distortion = 1.0 + r2 * 0.15 + r2 * r2 * 0.05;
  vec2 distortedUv = centered * distortion + 0.5;

  // Detect out-of-bounds UVs — fade to dust color instead of hard clamp
  float oob = smoothstep(0.48, 0.52, max(abs(distortedUv.x - 0.5), abs(distortedUv.y - 0.5)));
  distortedUv = clamp(distortedUv, 0.001, 0.999);

  // ── Storm glitch: horizontal UV tearing (Tier 3+) ──────────────────────
  // Displaces a small fraction of scanlines horizontally.
  // Activates at uStormGlitchIntensity > 0.5 (levels 3–5).
  float tearThreshold = mix(1.0, 0.68, smoothstep(0.5, 1.0, uStormGlitchIntensity));

  // Coarse time step so tears snap discretely rather than sliding.
  float snapTime = floor(uTime * mix(5.0, 13.0, uStormGlitchIntensity));

  float tearRow    = hash(vec2(floor(distortedUv.y * 180.0), snapTime));
  float tearActive = step(tearThreshold, tearRow);
  float tearAmt    = (hash(vec2(tearRow, snapTime + 1.0)) - 0.5) * 0.048
                     * uStormGlitchIntensity * tearActive;
  distortedUv.x = clamp(distortedUv.x + tearAmt, 0.001, 0.999);

  // ── Storm glitch: signal roll — full-row UV jump (Tier 4) ─────────────
  // At level 5 a handful of scanlines get a small vertical shift.
  float rollIntensity = smoothstep(0.85, 1.0, uStormGlitchIntensity);
  if (rollIntensity > 0.0) {
    float rollRow  = hash(vec2(floor(distortedUv.y * 80.0), snapTime * 0.5));
    float rollBand = step(0.98, rollRow) * rollIntensity;
    distortedUv.y = clamp(distortedUv.y + (hash(vec2(rollRow, 77.0)) - 0.5) * 0.04 * rollBand, 0.001, 0.999);
  }

  // --- Chromatic aberration —————————————————————————————————————————————
  // Base CA from barrel; boosted by storm severity and incoming warning.
  float caBase   = 0.0015 + r2 * 0.003;
  float caStorm  = uStormGlitchIntensity * 0.009; // up to +0.9% spread at level 5
  float caWarn   = uStormPhaseIncoming   * 0.003; // gentle pre-storm fringe
  float caStrength = caBase + caStorm + caWarn;
  vec2 caDir = centered * caStrength;
  float red   = texture2D(tDiffuse, distortedUv + caDir).r;
  float green = texture2D(tDiffuse, distortedUv).g;
  float blue  = texture2D(tDiffuse, distortedUv - caDir).b;
  vec4 color = vec4(red, green, blue, 1.0);

  // --- Wind-reactive dust atmosphere ---
  float windFactor = clamp(uWindSpeed, 0.0, 6.0);

  vec3 dustColor = vec3(0.85, 0.52, 0.30);
  vec2 uv = vUv * vec2(uResolution.x / uResolution.y, 1.0);
  float dustNoise  = fbm(uv * 2.0 + uTime * 0.03 * windFactor);
  float dustNoise2 = fbm(uv * 4.0 - uTime * 0.02 * windFactor + 100.0);
  float dustPattern = dustNoise * 0.6 + dustNoise2 * 0.4;

  float heightGrad  = smoothstep(0.0, 0.5, vUv.y) * smoothstep(1.0, 0.6, vUv.y);
  float edgeVignette = smoothstep(0.0, 0.3, vUv.x) * smoothstep(1.0, 0.7, vUv.x);

  float stormBoost     = uDustStormLevel / 5.0;
  float dustIntensity  = mix(0.25, 0.65, smoothstep(0.5, 3.0, windFactor));

  float dustAmount = dustPattern * uDustCover * dustIntensity;
  dustAmount *= (1.0 - heightGrad * 0.5);
  dustAmount *= mix(0.7, 1.0, edgeVignette);

  float stormBlanket = stormBoost * stormBoost * 0.7;

  float totalDust = min(dustAmount + stormBlanket, 0.85);
  color.rgb = mix(color.rgb, dustColor, totalDust);

  // Blend OOB edges into dust color for natural wide-angle falloff
  color.rgb = mix(color.rgb, dustColor * 0.6, oob);

  // --- Drone feed color grade ---
  float lum = dot(color.rgb, vec3(0.299, 0.587, 0.114));

  // Pre-storm: heavier desaturation — signal compression warning
  float warnDesat = mix(0.85, 0.65, uStormPhaseIncoming);
  // Active storm: further desaturation at high severity
  float stormDesat = mix(warnDesat, 0.68, smoothstep(0.6, 1.0, uStormGlitchIntensity));
  color.rgb = mix(vec3(lum), color.rgb, stormDesat);

  // Warm Mars push
  color.rgb *= vec3(1.06, 0.96, 0.88);

  // Lift shadows slightly (washed out feed look)
  color.rgb = color.rgb * 0.92 + 0.03;

  // --- Scan lines ─────────────────────────────────────────────────────────
  // Static fine scanlines — always on, baseline feed texture
  float scanLine = sin(vUv.y * uResolution.y * 1.0) * 0.5 + 0.5;
  scanLine = smoothstep(0.3, 0.7, scanLine);

  // Storm pumps scan-line contrast
  float scanContrast = mix(0.03, 0.18, uStormGlitchIntensity + uStormPhaseIncoming * 0.4);
  color.rgb *= (1.0 - scanContrast) + scanLine * scanContrast;

  // ── Crawling interference lines — scroll upward, faster with storm severity ─
  // Coarser bands that visibly move so the screen "feels" live during a storm.
  float crawlSpeed  = mix(0.0, 3.8, uStormGlitchIntensity) + uStormPhaseIncoming * 0.6;
  float crawlLine   = sin((vUv.y + uTime * crawlSpeed) * uResolution.y * 0.25) * 0.5 + 0.5;
  crawlLine = smoothstep(0.35, 0.65, crawlLine);
  float crawlStrength = mix(0.0, 0.14, uStormGlitchIntensity) + uStormPhaseIncoming * 0.025;
  color.rgb *= (1.0 - crawlStrength) + crawlLine * crawlStrength;

  // ── TV static snow — wide rolling bands of grain (analog out-of-tune feel) ─
  // A slow-moving band of heavy noise drifts up the screen like a bad signal.
  float staticBandSpeed = mix(0.0, 0.55, uStormGlitchIntensity);
  float staticBandPos   = fract(vUv.y - uTime * staticBandSpeed);
  float staticBand      = smoothstep(0.55, 0.35, staticBandPos)
                        * smoothstep(0.0,  0.15, staticBandPos);
  float staticSnow = (hash(vUv * uResolution * 0.8 + floor(uTime * 24.0)) - 0.5)
                     * staticBand * uStormGlitchIntensity * 0.60;
  color.rgb += staticSnow;

  // --- Signal noise ───────────────────────────────────────────────────────
  // Base sensor noise; TV-static grain at higher severity
  float noiseScale = mix(0.04, 0.10, uStormGlitchIntensity);
  float sensorNoise = (hash(vUv * uResolution + uTime * 137.0) - 0.5) * noiseScale;
  color.rgb += sensorNoise;

  // Interference burst — baseline probability lifts sharply with storm level.
  // Tier 1 (pre-storm):  threshold 0.992
  // Tier 2 (levels 1-2): threshold 0.985
  // Tier 3 (levels 3-4): threshold 0.965
  // Tier 4 (level  5  ): threshold 0.940
  float burstThreshold = mix(
    0.995,                                  // baseline (no storm)
    0.950,                                  // level-5 planet storm
    uStormGlitchIntensity + uStormPhaseIncoming * 0.12
  );
  float burstFreq = mix(4.0, 28.0, uStormGlitchIntensity); // faster flicker in heavy storms
  float burstLine  = hash(vec2(floor(vUv.y * 200.0), floor(uTime * burstFreq)));
  float burstAmt   = mix(0.15, 0.34, uStormGlitchIntensity);
  float burst = step(burstThreshold, burstLine)
                * (hash(vUv * uResolution * 0.5 + uTime * 50.0) - 0.5)
                * burstAmt;
  color.rgb += burst;

  // ── Storm signal blackout bands (Tier 4 — level 5 only) ──────────────
  // Random horizontal bands go fully black for one "snap frame", simulating
  // total signal loss on a few scan rows.
  float blackoutIntensity = smoothstep(0.88, 1.0, uStormGlitchIntensity);
  if (blackoutIntensity > 0.0) {
    float blackoutRow  = hash(vec2(floor(vUv.y * 120.0), snapTime * 1.3));
    float blackoutBand = step(0.985, blackoutRow) * blackoutIntensity;
    color.rgb = mix(color.rgb, vec3(0.0), blackoutBand * 0.6);
  }

  // --- Vignette (single unified lens falloff) ---
  float vigDist = length(centered) * 2.0;
  float vig = 1.0 - smoothstep(0.5, 1.5, vigDist) * 0.25;
  color.rgb *= vig;

  gl_FragColor = color;
}
