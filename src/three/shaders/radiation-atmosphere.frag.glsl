uniform sampler2D tDiffuse;
uniform float uRadiationLevel;
uniform float uTime;
uniform vec2 uResolution;
/** 0.0 = third-person orbit camera, 1.0 = MastCam/ChemCam first-person CCD. */
uniform float uInstrumentCamera;

varying vec2 vUv;

// Simple hash — no external includes
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float hash1(float v) {
  return fract(sin(v * 74.3219) * 93856.1247);
}

void main() {
  vec4 color = texture2D(tDiffuse, vUv);

  // Base radiation strength — same in both third-person and instrument camera.
  // CCD-specific artifacts (streaks, banding, saturation) add on top but the
  // base tint/scanlines/hotpixels stay consistent so the player isn't surprised.
  float radStrength = smoothstep(0.25, 1.0, uRadiationLevel);

  if (radStrength <= 0.0) {
    gl_FragColor = color;
    return;
  }

  vec3 radTint = vec3(0.1, 0.6, 0.3);

  // ── 1. Green shadow push ─────────────────────────────────────────────────
  float lum = dot(color.rgb, vec3(0.299, 0.587, 0.114));
  float shadowMask = 1.0 - smoothstep(0.4, 0.85, lum);
  color.rgb = mix(color.rgb, radTint, shadowMask * radStrength * 0.35);

  // ── 2. Fast thin scanlines (scrolling upward) ────────────────────────────
  float scanSpeed   = 1.8;
  float scanFreq    = uResolution.y * 0.85;
  float scanPhase   = vUv.y + uTime * scanSpeed;
  float rawScan     = sin(scanPhase * scanFreq) * 0.5 + 0.5;
  float scanLine    = pow(rawScan, 8.0);
  float scanOpacity = radStrength * 0.10;
  color.rgb += vec3(0.0, scanLine, 0.15 * scanLine) * scanOpacity;

  // ── 3. Hot pixel clusters ────────────────────────────────────────────────
  float frameKey   = floor(uTime * 15.0);
  vec2  pixelCoord = floor(vUv * uResolution);
  float pixHash    = hash(pixelCoord * 0.01 + vec2(frameKey * 0.371, frameKey * 0.618));
  float hotThresh  = mix(0.996, 0.960, radStrength * radStrength);
  float hotPixel   = step(hotThresh, pixHash);
  float hotBright  = mix(0.5, 1.2, hash(pixelCoord * 0.02 + frameKey));
  color.rgb += vec3(0.05, hotBright, 0.15) * hotPixel;

  // ── 4. Static snow band (hazardous only) ─────────────────────────────────
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

  // ── 5. Reversed chromatic aberration ─────────────────────────────────────
  if (radStrength > 0.4) {
    float caAmt = smoothstep(0.4, 1.0, radStrength) * 0.006;
    vec2  cDir  = (vUv - 0.5);
    float r2    = dot(cDir, cDir);
    vec2  caOff = cDir * (caAmt + r2 * 0.004);
    float gDisplaced = texture2D(tDiffuse, vUv + caOff).g;
    color.g = mix(color.g, gDisplaced, smoothstep(0.4, 1.0, radStrength) * 0.5);
  }

  // ── 6. Full-frame green flash (extreme levels) ──────────────────────────
  if (uRadiationLevel > 0.85) {
    float flashStrength = smoothstep(0.85, 1.0, uRadiationLevel);
    float flashFrame    = floor(uTime * 60.0);
    float flashRoll     = hash1(flashFrame);
    float flashThresh   = mix(0.996, 0.990, flashStrength);
    float flashOn       = step(flashThresh, flashRoll);
    float flashRollPrev = hash1(flashFrame - 1.0);
    flashOn = max(flashOn, step(flashThresh, flashRollPrev));
    color.rgb = mix(color.rgb, vec3(0.05, 0.85, 0.20), flashOn * flashStrength * 0.55);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // INSTRUMENT CAMERA CCD ARTIFACTS (MastCam / ChemCam first-person only)
  // These simulate real radiation damage to scientific CCD sensors:
  // charge bleed streaks, vertical banding, and sensor saturation bursts.
  // ═══════════════════════════════════════════════════════════════════════════

  if (uInstrumentCamera > 0.5 && radStrength > 0.0) {
    float ccdStr = radStrength * uInstrumentCamera;

    // ── CCD Charge bleed streaks ───────────────────────────────────────────
    // When a high-energy particle hits a CCD pixel, it dumps charge that
    // bleeds along the entire sensor row — horizontal green lines.
    float streakFrame = floor(uTime * 8.0); // new streaks ~8 times/sec
    float streakSeed  = hash(vec2(floor(vUv.y * 80.0), streakFrame));
    float streakOn    = step(mix(0.97, 0.88, ccdStr), streakSeed);
    // Streak runs the full width but with random start/end
    float streakMask  = streakOn * smoothstep(0.0, 0.05, vUv.x) * smoothstep(1.0, 0.95, vUv.x);
    float streakBright = 0.15 + hash(vec2(streakFrame, floor(vUv.y * 80.0))) * 0.25;
    color.rgb += vec3(0.03, streakBright, 0.06) * streakMask * ccdStr;

    // ── Vertical banding ───────────────────────────────────────────────────
    // Columns of slightly elevated green signal — readout noise in the CCD.
    float bandCol   = sin(pixelCoord.x * 0.15 + uTime * 0.5) * 0.5 + 0.5;
    float bandPulse = pow(bandCol, 6.0);
    color.g += bandPulse * ccdStr * 0.06;

    // ── Sensor saturation flash ────────────────────────────────────────────
    // A high-energy particle dumps enough charge to briefly green-out
    // a rectangular region of the sensor.
    if (ccdStr > 0.4) {
      float satFrame  = floor(uTime * 4.0);
      float satRoll   = hash1(satFrame * 7.31);
      float satChance = mix(0.95, 0.75, ccdStr);
      if (satRoll > satChance) {
        // Random rectangle position and size
        vec2 satCenter = vec2(hash1(satFrame * 3.17), hash1(satFrame * 5.23));
        vec2 satSize   = vec2(0.08 + hash1(satFrame * 1.91) * 0.15,
                              0.04 + hash1(satFrame * 2.73) * 0.08);
        vec2 satDist   = abs(vUv - satCenter) / satSize;
        float satMask  = (1.0 - smoothstep(0.8, 1.0, max(satDist.x, satDist.y)));
        color.rgb = mix(color.rgb, vec3(0.15, 0.9, 0.3), satMask * 0.4 * ccdStr);
      }
    }
  }

  // ── 7. Vignette tightening ───────────────────────────────────────────────
  vec2 centered = vUv - 0.5;
  float vigDist = length(centered) * 2.0;
  float vigBase  = smoothstep(0.5, 1.5, vigDist) * 0.25;
  float vigExtra = smoothstep(0.4, 1.3, vigDist) * radStrength * 0.30;
  color.rgb *= 1.0 - vigBase - vigExtra;

  gl_FragColor = color;
}
