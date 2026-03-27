uniform vec3 uSunDirection;
uniform float uTimeOfDay;
uniform float uWindSpeed;
uniform float uDustStormLevel;
uniform float uWaterIceIndex;
uniform vec3 uWindDirection;
uniform float uTime;

varying vec3 vWorldPos;

// --- Noise utilities ---
float hash(vec3 p) {
  p = fract(p * vec3(443.897, 441.423, 437.195));
  p += dot(p, p.yzx + 19.19);
  return fract((p.x + p.y) * p.z);
}

float noise3d(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float n000 = hash(i);
  float n100 = hash(i + vec3(1, 0, 0));
  float n010 = hash(i + vec3(0, 1, 0));
  float n110 = hash(i + vec3(1, 1, 0));
  float n001 = hash(i + vec3(0, 0, 1));
  float n101 = hash(i + vec3(1, 0, 1));
  float n011 = hash(i + vec3(0, 1, 1));
  float n111 = hash(i + vec3(1, 1, 1));
  float nx00 = mix(n000, n100, f.x);
  float nx10 = mix(n010, n110, f.x);
  float nx01 = mix(n001, n101, f.x);
  float nx11 = mix(n011, n111, f.x);
  float nxy0 = mix(nx00, nx10, f.y);
  float nxy1 = mix(nx01, nx11, f.y);
  return mix(nxy0, nxy1, f.z);
}

float fbm(vec3 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    v += a * noise3d(p);
    p *= 2.1;
    a *= 0.5;
  }
  return v;
}

void main() {
  vec3 dir = normalize(vWorldPos);
  float h = dir.y;

  float sunElevation = uSunDirection.y;
  float sunDot = max(0.0, dot(dir, uSunDirection));
  float antiSunDot = max(0.0, dot(dir, -uSunDirection));

  // --- Dust factor from weather ---
  float dustFactor = clamp(uDustStormLevel / 5.0, 0.0, 1.0);
  float windDust = clamp((uWindSpeed - 1.0) * 0.15, 0.0, 0.3);
  float totalDust = clamp(dustFactor + windDust, 0.0, 1.0);

  // --- Zenith darkening: zenith at ~60% brightness of horizon ---
  float zenithGrad = pow(max(0.0, h), 0.6);

  // --- 5-stop time-of-day color arc ---
  // Stop colors (zenith / horizon pairs)
  // Early morning: steel blue-gray
  vec3 morningZenith  = vec3(0.55, 0.62, 0.70);
  vec3 morningHorizon = vec3(0.65, 0.68, 0.72);
  // Midday: salmon-tan
  vec3 middayZenith   = vec3(0.72, 0.55, 0.42);
  vec3 middayHorizon  = vec3(0.82, 0.70, 0.55);
  // Afternoon: golden ochre
  vec3 afternoonZenith  = vec3(0.80, 0.62, 0.38);
  vec3 afternoonHorizon = vec3(0.88, 0.78, 0.58);
  // Dusk: brown-orange
  vec3 duskZenith  = vec3(0.12, 0.08, 0.06);
  vec3 duskHorizon = vec3(0.50, 0.30, 0.20);
  // Night
  vec3 nightZenith  = vec3(0.02, 0.015, 0.015);
  vec3 nightHorizon = vec3(0.03, 0.02, 0.02);

  // Time breakpoints: morning ~0.25, midday ~0.50, afternoon ~0.62, dusk ~0.78, night ~0.90
  float t = uTimeOfDay;

  // Compute zenith and horizon colors by blending through stops
  float tMorning   = smoothstep(0.20, 0.28, t);
  float tMidday    = smoothstep(0.28, 0.45, t);
  float tAfternoon = smoothstep(0.45, 0.60, t);
  float tDusk      = smoothstep(0.60, 0.78, t);
  float tNight     = smoothstep(0.78, 0.90, t);

  // Pre-dawn is also night, wrap around
  float tPreDawn   = 1.0 - smoothstep(0.15, 0.25, t);

  vec3 zenithColor = morningZenith;
  zenithColor = mix(zenithColor, middayZenith, tMidday);
  zenithColor = mix(zenithColor, afternoonZenith, tAfternoon);
  zenithColor = mix(zenithColor, duskZenith, tDusk);
  zenithColor = mix(zenithColor, nightZenith, tNight);
  zenithColor = mix(zenithColor, nightZenith, tPreDawn);

  vec3 horizonCol = morningHorizon;
  horizonCol = mix(horizonCol, middayHorizon, tMidday);
  horizonCol = mix(horizonCol, afternoonHorizon, tAfternoon);
  horizonCol = mix(horizonCol, duskHorizon, tDusk);
  horizonCol = mix(horizonCol, nightHorizon, tNight);
  horizonCol = mix(horizonCol, nightHorizon, tPreDawn);

  // Blend zenith to horizon using zenith darkening
  // zenithGrad is 0 at horizon, 1 at zenith
  // Zenith at 60% brightness: darken zenith color
  vec3 skyColor = mix(horizonCol, zenithColor * 0.6, zenithGrad);

  // --- Morning blue factor ---
  // Sky is distinctly blue-gray before timeOfDay 0.35
  float morningBlue = 1.0 - smoothstep(0.25, 0.40, uTimeOfDay);
  vec3 blueTint = vec3(0.50, 0.58, 0.68);
  skyColor = mix(skyColor, mix(skyColor, blueTint, 0.4), morningBlue * (1.0 - tPreDawn));

  // --- Weather-reactive dust: shift sky orange + brownish cast ---
  vec3 dustOrange = vec3(0.75, 0.50, 0.28);
  vec3 stormBrown = vec3(0.45, 0.30, 0.18);
  skyColor = mix(skyColor, dustOrange, windDust * 0.5);
  skyColor = mix(skyColor, stormBrown, dustFactor * 0.4);

  // --- Anti-sun cool tint (Mars atmospheric scattering) ---
  float dayFactor = smoothstep(-0.1, 0.3, sunElevation);
  vec3 coolAntiSun = vec3(0.45, 0.52, 0.58);
  skyColor = mix(skyColor, coolAntiSun, antiSunDot * 0.2 * dayFactor);

  // --- Dusk blue sunset band ---
  vec3 sunsetBlue = vec3(0.25, 0.40, 0.65);
  float duskBand = smoothstep(-0.25, -0.05, sunElevation) * smoothstep(0.3, 0.05, sunElevation);
  skyColor = mix(skyColor, sunsetBlue, pow(sunDot, 8.0) * 0.5 * duskBand);

  // --- Sun blue corona (Mars forward-scattering) ---
  // Strongest when sun is high, weather-dependent
  float coronaStrength = mix(0.35, 0.0, totalDust);
  float coronaBase = pow(sunDot, 8.0);
  float sunHighFactor = smoothstep(0.0, 0.5, sunElevation);
  vec3 coronaBlue = vec3(0.35, 0.55, 0.80);
  skyColor += coronaBlue * coronaBase * coronaStrength * sunHighFactor * dayFactor;

  // --- Sun disc + glow ---
  vec3 sunColor = mix(vec3(1.0, 0.85, 0.6), vec3(1.0, 0.6, 0.3), 1.0 - max(0.0, sunElevation));
  // Storm dims and reddens sun
  sunColor = mix(sunColor, vec3(0.9, 0.4, 0.15), totalDust * 0.5);
  float stormSunDim = 1.0 - totalDust * 0.6;

  // Disc
  float sunDisc = smoothstep(0.9995, 0.9999, sunDot);
  skyColor += sunColor * sunDisc * 1.5 * stormSunDim;
  // Inner glow
  float innerGlow = pow(sunDot, 128.0) * 0.8;
  skyColor += sunColor * innerGlow * dayFactor * stormSunDim;
  // Outer glow (wide, soft)
  float outerGlow = pow(sunDot, 16.0) * 0.15;
  skyColor += sunColor * outerGlow * dayFactor * stormSunDim;

  // Blue glow at dusk around sun
  float blueGlow = pow(sunDot, 12.0) * duskBand;
  skyColor += sunsetBlue * blueGlow * 0.5;

  // --- Dust haze layer ---
  float dustHaze = exp(-max(0.0, h) * 1.5) * (1.0 - exp(-max(0.0, h) * 20.0));
  vec3 dustHazeColor = mix(vec3(0.75, 0.58, 0.42), vec3(0.65, 0.62, 0.55), antiSunDot * 0.3);
  dustHazeColor = mix(dustHazeColor, stormBrown, totalDust * 0.3);
  skyColor = mix(skyColor, dustHazeColor, dustHaze * 0.3 * dayFactor);

  // --- Cloud wisps (two-layer fbm, directional stretch) ---
  // Density from water ice index, storm-suppressed
  float cloudDensity = uWaterIceIndex * (1.0 - dustFactor * 0.8);
  if (cloudDensity > 0.01 && h > -0.05) {
    // Stretch noise along wind direction
    vec3 windDir3 = normalize(uWindDirection + vec3(0.001));
    // Project dir onto plane, stretch along wind
    vec3 cloudPos = dir * 8.0;
    float windStretch = dot(cloudPos, windDir3);
    cloudPos += windDir3 * windStretch * 1.5;

    // Two layers at different scales and speeds
    float t1 = fbm(cloudPos * 1.2 + vec3(uTime * 0.02, 0.0, uTime * 0.01));
    float t2 = fbm(cloudPos * 2.5 + vec3(-uTime * 0.015, uTime * 0.008, 0.0));
    float cloud = (t1 * 0.6 + t2 * 0.4);
    cloud = smoothstep(0.42, 0.68, cloud);

    // Altitude mask — clouds mostly above horizon
    float altMask = smoothstep(-0.05, 0.15, h);
    cloud *= altMask;

    // Noctilucent glow: most visible at dawn/dusk
    float noctilucent = duskBand * 0.6 + (1.0 - smoothstep(0.20, 0.35, t)) * 0.3;
    float cloudBright = mix(0.3, 0.7, noctilucent);

    vec3 cloudColor = mix(vec3(0.85, 0.78, 0.72), vec3(0.70, 0.75, 0.85), noctilucent);
    cloudColor *= cloudBright;

    skyColor = mix(skyColor, cloudColor, cloud * cloudDensity * 0.5);
  }

  // --- Stars at night (round points, hash-based placement) ---
  float nightStrength = 1.0 - dayFactor;
  if (nightStrength > 0.01 && h > 0.0) {
    vec3 cellSize = vec3(300.0);
    vec3 starCell = floor(dir * cellSize);
    vec3 starCenter = (starCell + 0.5) / cellSize;
    float starHash = hash(starCell);

    if (starHash > 0.993) {
      float angDist = length(dir - normalize(starCenter));
      float starRadius = 0.001 + starHash * 0.0008;
      float starBright = smoothstep(starRadius, starRadius * 0.3, angDist);

      // Twinkle
      float twinkle = sin(starHash * 6283.0 + uTimeOfDay * 40.0) * 0.3 + 0.7;

      // Slight color variation
      vec3 starColor = mix(vec3(0.9, 0.9, 1.0), vec3(1.0, 0.85, 0.7), starHash * 2.0 - 1.0);

      // Storm dims stars
      float starStormDim = 1.0 - totalDust * 0.7;
      skyColor += starColor * starBright * twinkle * nightStrength * 1.2 * starStormDim;
    }
  }

  gl_FragColor = vec4(skyColor, 1.0);
}
