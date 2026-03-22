uniform vec3 uSunDirection;
uniform float uTimeOfDay;

varying vec3 vWorldPos;

float hash(vec3 p) {
  p = fract(p * vec3(443.897, 441.423, 437.195));
  p += dot(p, p.yzx + 19.19);
  return fract((p.x + p.y) * p.z);
}

void main() {
  vec3 dir = normalize(vWorldPos);
  float h = dir.y;

  float sunElevation = uSunDirection.y;
  float sunDot = max(0.0, dot(dir, uSunDirection));

  // --- Anti-sun direction for blue-green tint ---
  float antiSunDot = max(0.0, dot(dir, -uSunDirection));

  // --- Day sky (reference: dusty pink-tan, hazy, muted) ---
  // Near sun side: warm dusty tan
  vec3 daySunSide = vec3(0.78, 0.60, 0.45);
  // Zenith: muted salmon-pink
  vec3 dayZenith = vec3(0.72, 0.52, 0.42);
  // Opposite sun: subtle blue-green tint (Mars atmospheric scattering)
  vec3 dayAntiSun = vec3(0.58, 0.58, 0.55);

  vec3 dayColor = mix(daySunSide, dayZenith, max(0.0, h * 0.8));
  // Blue-green tint on the side away from the sun
  dayColor = mix(dayColor, dayAntiSun, antiSunDot * 0.4);
  // Sun-side warmth
  dayColor = mix(dayColor, daySunSide, pow(sunDot, 3.0) * 0.3);

  // --- Horizon haze (thick dusty band, key to the Mars look) ---
  float horizonBand = exp(-abs(h) * 2.5);
  vec3 horizonColor = vec3(0.80, 0.65, 0.50);
  // Horizon opposite sun gets that blue-green tint
  vec3 horizonAntiSun = vec3(0.62, 0.68, 0.65);
  vec3 hazeColor = mix(horizonColor, horizonAntiSun, antiSunDot * 0.5);
  dayColor = mix(dayColor, hazeColor, horizonBand * 0.7);

  // --- Dusk/dawn ---
  vec3 duskHorizon = vec3(0.50, 0.30, 0.20);
  vec3 duskZenith = vec3(0.12, 0.08, 0.06);
  vec3 duskColor = mix(duskHorizon, duskZenith, max(0.0, h));
  // Mars blue sunset
  vec3 sunsetBlue = vec3(0.25, 0.40, 0.65);
  duskColor = mix(duskColor, sunsetBlue, pow(sunDot, 8.0) * 0.5);

  // --- Night ---
  vec3 nightColor = vec3(0.02, 0.015, 0.015);

  // --- Blend by sun elevation ---
  float dayFactor = smoothstep(-0.1, 0.3, sunElevation);
  float duskFactor = smoothstep(-0.25, -0.05, sunElevation) * smoothstep(0.3, 0.05, sunElevation);

  vec3 color = mix(nightColor, dayColor, dayFactor);
  color = mix(color, duskColor, duskFactor);

  // --- Sun disc + glow ---
  vec3 sunColor = mix(vec3(1.0, 0.85, 0.6), vec3(1.0, 0.6, 0.3), 1.0 - max(0.0, sunElevation));
  // Disc
  float sunDisc = smoothstep(0.9995, 0.9999, sunDot);
  color += sunColor * sunDisc * 1.5;
  // Inner glow
  float innerGlow = pow(sunDot, 128.0) * 0.8;
  color += sunColor * innerGlow * dayFactor;
  // Outer glow (wide, soft)
  float outerGlow = pow(sunDot, 16.0) * 0.15;
  color += sunColor * outerGlow * dayFactor;

  // Blue glow at dusk around sun
  float blueGlow = pow(sunDot, 12.0) * duskFactor;
  color += sunsetBlue * blueGlow * 0.5;

  // --- Dust haze layer (makes sky feel thick and atmospheric) ---
  // Low-altitude haze that obscures the horizon
  float dustHaze = exp(-max(0.0, h) * 1.5) * (1.0 - exp(-max(0.0, h) * 20.0));
  vec3 dustHazeColor = mix(vec3(0.75, 0.58, 0.42), vec3(0.65, 0.62, 0.55), antiSunDot * 0.3);
  color = mix(color, dustHazeColor, dustHaze * 0.3 * dayFactor);

  // --- Stars at night (round points, not grid) ---
  float nightStrength = 1.0 - dayFactor;
  if (nightStrength > 0.01 && h > 0.0) {
    // Use finer grid + distance to cell center for round stars
    vec3 cellSize = vec3(300.0);
    vec3 starCell = floor(dir * cellSize);
    vec3 starCenter = (starCell + 0.5) / cellSize;
    float starHash = hash(starCell);

    // Only some cells have stars
    if (starHash > 0.993) {
      // Distance from ray to star center (angular distance)
      float angDist = length(dir - normalize(starCenter));
      float starRadius = 0.001 + starHash * 0.0008;
      float starBright = smoothstep(starRadius, starRadius * 0.3, angDist);

      // Twinkle
      float twinkle = sin(starHash * 6283.0 + uTimeOfDay * 40.0) * 0.3 + 0.7;

      // Slight color variation
      vec3 starColor = mix(vec3(0.9, 0.9, 1.0), vec3(1.0, 0.85, 0.7), starHash * 2.0 - 1.0);
      color += starColor * starBright * twinkle * nightStrength * 1.2;
    }
  }

  gl_FragColor = vec4(color, 1.0);
}
