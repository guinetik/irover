uniform sampler2D tDiffuse;
uniform float uDustCover;
uniform float uWindSpeed;
uniform float uDustStormLevel;
uniform float uTime;
uniform vec2 uResolution;

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

  // --- Chromatic aberration ---
  float caStrength = 0.0015 + r2 * 0.003; // stronger at edges
  vec2 caDir = centered * caStrength;
  float red   = texture2D(tDiffuse, distortedUv + caDir).r;
  float green = texture2D(tDiffuse, distortedUv).g;
  float blue  = texture2D(tDiffuse, distortedUv - caDir).b;
  vec4 color = vec4(red, green, blue, 1.0);

  // --- Wind-reactive dust atmosphere ---
  // windFactor: 0 at dead calm, 1 at baseline (5 m/s), ~4 at severe storm
  float windFactor = clamp(uWindSpeed, 0.0, 6.0);

  vec3 dustColor = vec3(0.85, 0.52, 0.30);
  vec2 uv = vUv * vec2(uResolution.x / uResolution.y, 1.0);
  float dustNoise = fbm(uv * 2.0 + uTime * 0.03 * windFactor);
  float dustNoise2 = fbm(uv * 4.0 - uTime * 0.02 * windFactor + 100.0);
  float dustPattern = dustNoise * 0.6 + dustNoise2 * 0.4;

  float heightGrad = smoothstep(0.0, 0.5, vUv.y) * smoothstep(1.0, 0.6, vUv.y);
  float edgeVignette = smoothstep(0.0, 0.3, vUv.x) * smoothstep(1.0, 0.7, vUv.x);

  // Calm wind: visible haze; storm: heavy orange blanket
  float stormBoost = uDustStormLevel / 5.0;
  float dustIntensity = mix(0.25, 0.65, smoothstep(0.5, 3.0, windFactor));

  // Pattern-based haze (textured dust)
  float dustAmount = dustPattern * uDustCover * dustIntensity;
  dustAmount *= (1.0 - heightGrad * 0.5);
  dustAmount *= mix(0.7, 1.0, edgeVignette);

  // Storm: uniform blanket layered on top (not pattern-dependent)
  float stormBlanket = stormBoost * stormBoost * 0.7;

  float totalDust = min(dustAmount + stormBlanket, 0.85);
  color.rgb = mix(color.rgb, dustColor, totalDust);

  // Blend OOB edges into dust color for natural wide-angle falloff
  color.rgb = mix(color.rgb, dustColor * 0.6, oob);

  // --- Drone feed color grade ---
  // Slight desaturation (compressed video feel)
  float lum = dot(color.rgb, vec3(0.299, 0.587, 0.114));
  color.rgb = mix(vec3(lum), color.rgb, 0.85);

  // Warm Mars push
  color.rgb *= vec3(1.06, 0.96, 0.88);

  // Lift shadows slightly (washed out feed look)
  color.rgb = color.rgb * 0.92 + 0.03;

  // --- Scan lines (subtle, not CRT) ---
  float scanLine = sin(vUv.y * uResolution.y * 1.0) * 0.5 + 0.5;
  scanLine = smoothstep(0.3, 0.7, scanLine);
  color.rgb *= 0.97 + scanLine * 0.03;

  // --- Signal noise ---
  // Base sensor noise
  float sensorNoise = (hash(vUv * uResolution + uTime * 137.0) - 0.5) * 0.04;
  color.rgb += sensorNoise;

  // Occasional horizontal noise burst (interference band)
  float burstLine = hash(vec2(floor(vUv.y * 200.0), floor(uTime * 4.0)));
  float burst = step(0.995, burstLine) * (hash(vUv * uResolution * 0.5 + uTime * 50.0) - 0.5) * 0.15;
  color.rgb += burst;

  // --- Vignette (single unified lens falloff) ---
  float vigDist = length(centered) * 2.0;
  float vig = 1.0 - smoothstep(0.5, 1.5, vigDist) * 0.25;
  color.rgb *= vig;

  gl_FragColor = color;
}
