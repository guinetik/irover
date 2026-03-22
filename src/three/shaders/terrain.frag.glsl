uniform float uDustCover;
uniform float uIronOxide;
uniform float uBasalt;
uniform float uRoughness;
uniform float uCraterDensity;
uniform vec3 uSunDirection;
uniform float uHeightMin;
uniform float uHeightRange;
uniform float uWaterIce;      // waterIceIndex: 0-1, high on polar caps
uniform float uTemperature;   // normalized 0-1 from temperatureMaxK (150K=0, 300K=1)
uniform float uSilicate;      // silicateIndex: 0-1

// Detail textures
uniform sampler2D uRockTexture;   // texture1 — greyscale cracked bedrock
uniform sampler2D uDustTexture;   // texture2 — iron-rich dusty surface
uniform sampler2D uSiteTexture;   // orbital NASA imagery for macro color
uniform float uHasSiteTexture;    // 1.0 if site texture loaded, 0.0 if missing

varying vec2 vUv;
varying vec3 vWorldPosition;
varying vec3 vNormal;
varying float vHeight;
varying float vSlope;

// --- Noise functions ---
float valueNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = fract(sin(dot(i, vec2(127.1, 311.7))) * 43758.5453);
  float b = fract(sin(dot(i + vec2(1.0, 0.0), vec2(127.1, 311.7))) * 43758.5453);
  float c = fract(sin(dot(i + vec2(0.0, 1.0), vec2(127.1, 311.7))) * 43758.5453);
  float d = fract(sin(dot(i + vec2(1.0, 1.0), vec2(127.1, 311.7))) * 43758.5453);
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float fbm(vec2 p, int octaves) {
  float v = 0.0;
  float a = 0.5;
  vec2 shift = vec2(100.0);
  for (int i = 0; i < 6; i++) {
    if (i >= octaves) break;
    v += a * valueNoise(p);
    p = p * 2.0 + shift;
    a *= 0.5;
  }
  return v;
}

void main() {
  float hn = clamp((vHeight - uHeightMin) / max(uHeightRange, 0.1), 0.0, 1.0);

  // World-space tiling UVs at different scales
  vec2 wuv = vWorldPosition.xz * 0.02;

  // Texture tiling — two scales for detail + mid-range
  vec2 texUv1 = vWorldPosition.xz * 0.08;  // close detail
  vec2 texUv2 = vWorldPosition.xz * 0.02;  // mid-range variation

  // Sample textures at two scales and blend to reduce tiling
  vec3 rockTex1 = texture2D(uRockTexture, texUv1).rgb;
  vec3 rockTex2 = texture2D(uRockTexture, texUv2 * 1.3 + 0.5).rgb;
  vec3 rockTex = mix(rockTex1, rockTex2, 0.4);

  vec3 dustTex1 = texture2D(uDustTexture, texUv1 * 0.9).rgb;
  vec3 dustTex2 = texture2D(uDustTexture, texUv2 * 1.1 + 0.7).rgb;
  vec3 dustTex = mix(dustTex1, dustTex2, 0.35);

  // --- Procedural color tinting (modulate textures by site params) ---

  // Basalt darkens and desaturates rock — high basalt = near-black volcanic ground
  float basaltDark = smoothstep(0.4, 0.9, uBasalt);
  vec3 rockTint = mix(
    vec3(0.85, 0.70, 0.55),  // warm brown rock
    vec3(0.38, 0.36, 0.34),  // dark volcanic basalt
    basaltDark
  );
  vec3 rockColor = rockTex * rockTint;

  // Iron oxide tint — reduced when basalt is high (lava flows suppress rust tones)
  float ironStrength = uIronOxide * (1.0 - basaltDark * 0.7);
  vec3 dustTint = mix(
    vec3(0.95, 0.80, 0.60),  // sandy
    vec3(1.10, 0.70, 0.45),  // iron-rich red
    ironStrength
  );
  vec3 dustColor = dustTex * dustTint;

  // Dark substrate (crevices, under dust) — even darker for volcanic sites
  vec3 substrateColor = rockTex * mix(
    vec3(0.40, 0.28, 0.20),
    vec3(0.18, 0.17, 0.16),  // near-black basalt substrate
    basaltDark * 0.8
  );

  // --- Layer blending ---

  float slopeFactor = smoothstep(0.12, 0.45, vSlope);

  float heightDust = smoothstep(0.6, 0.3, hn) * 0.3;
  float heightExposure = smoothstep(0.5, 0.8, hn) * 0.3;

  // Dust coverage with noise breakup — volcanic sites have less settled dust
  float dustCoverEffective = uDustCover * (1.0 - basaltDark * 0.5);
  float dustAmount = dustCoverEffective * (1.0 - slopeFactor) + heightDust;
  dustAmount = clamp(dustAmount, 0.0, 1.0);

  float dustNoise = fbm(wuv * 4.0 + 200.0, 4);
  dustAmount *= smoothstep(0.2, 0.6, dustNoise + dustAmount * 0.5);

  // Build up from substrate
  vec3 color = substrateColor;
  color = mix(color, rockColor, slopeFactor + heightExposure);
  color = mix(color, dustColor, dustAmount);

  // --- Site-specific orbital texture overlay ---
  // Real NASA orbital imagery provides the dominant color palette for each site.
  // Detail textures (rock/dust) provide micro-structure on top.
  if (uHasSiteTexture > 0.5) {
    // Sample at 3 scales to break up any single-image artifacts
    vec3 site1 = texture2D(uSiteTexture, vUv).rgb;
    vec3 site2 = texture2D(uSiteTexture, vUv * 2.3 + 0.17).rgb;
    vec3 site3 = texture2D(uSiteTexture, vUv * 0.5 + 0.4).rgb;
    vec3 siteColor = site1 * 0.5 + site2 * 0.3 + site3 * 0.2;

    // Extract luminance from detail textures to use as micro-structure
    float rockDetail = dot(rockTex, vec3(0.33)) * 0.5 + 0.5; // 0.5-1.0 range
    float dustDetail = dot(dustTex, vec3(0.33)) * 0.3 + 0.7; // 0.7-1.0 range
    float detail = mix(dustDetail, rockDetail, slopeFactor);

    // Apply detail structure to orbital color
    vec3 siteDetailed = siteColor * detail;

    // Blend strongly — orbital color is the hero, procedural is the fallback
    color = mix(color, siteDetailed, 0.65);
  }

  // --- Canyon height-stratified strata bands ---
  // Active when roughness is high; adds sedimentary layer colors at varying heights
  float strataStrength = smoothstep(0.55, 0.85, uRoughness) * (1.0 - uWaterIce);
  if (strataStrength > 0.01) {
    float band1 = sin(vHeight * 0.8 + 1.0) * 0.5 + 0.5;
    float band2 = sin(vHeight * 0.35 + 3.5) * 0.5 + 0.5;
    // Alternate between iron-red, ochre, and pale grey sediment layers
    vec3 strataA = vec3(0.72, 0.40, 0.22);  // iron-red layer
    vec3 strataB = vec3(0.78, 0.65, 0.40);  // ochre/tan layer
    vec3 strataC = vec3(0.60, 0.56, 0.52);  // pale grey layer
    vec3 strataColor = mix(strataA, strataB, band1);
    strataColor = mix(strataColor, strataC, band2 * 0.4);
    // Only show on exposed rock faces (high slope) and wall interiors
    float wallFace = slopeFactor;
    color = mix(color, strataColor * rockTex, strataStrength * wallFace * 0.65);
  }

  // --- Extra detail from roughness ---

  // Roughness-driven gravel patches (expose rock through dust)
  float gravel = fbm(vWorldPosition.xz * 0.4 + 500.0, 3);
  float gravelMask = smoothstep(0.52, 0.68, gravel) * uRoughness;
  color = mix(color, rockColor * 0.8, gravelMask * 0.5);

  // Crater effects
  float craterRim = smoothstep(0.6, 0.85, hn) * uCraterDensity;
  color += vec3(0.06, 0.04, 0.02) * craterRim;

  float craterFloor = smoothstep(0.3, 0.1, hn) * uCraterDensity;
  color *= 1.0 - craterFloor * 0.2;

  // --- Volcanic lava-flow dark streak detail ---
  // Dark streaks cutting through lighter areas; only significant at high basalt
  float streakNoise = fbm(vWorldPosition.xz * 0.06 + 300.0, 3);
  float streakMask = smoothstep(0.62, 0.72, streakNoise) * basaltDark;
  color = mix(color, color * vec3(0.30, 0.28, 0.26), streakMask * 0.55);

  // --- Polar ice / frost overlay ---
  // Blends in when waterIceIndex is high; uses rock texture for cracking patterns
  float iceStrength = smoothstep(0.35, 0.75, uWaterIce);
  if (iceStrength > 0.01) {
    // Rock texture luminance drives frost crack pattern (bright = clean ice, dark = cracks)
    float crackPattern = dot(rockTex, vec3(0.333));
    // Frost color: ranges from slightly blue-tinted white to pure cold white
    vec3 frostColor = mix(
      vec3(0.75, 0.80, 0.85),  // blue-grey shadowed ice
      vec3(0.92, 0.95, 0.98),  // bright clean ice surface
      crackPattern
    );
    // Ice collects in flat areas and low spots; slopes shed ice
    float iceSettle = 1.0 - slopeFactor * 0.7;
    float iceMask = iceStrength * iceSettle;
    color = mix(color, frostColor, iceMask * 0.85);

    // Subtle blue tint bleeds into surrounding ground even where ice isn't solid
    float iceBleed = smoothstep(0.1, 0.5, uWaterIce);
    color = mix(color, color * vec3(0.82, 0.88, 1.0), iceBleed * 0.25);
  }

  // --- Temperature-driven warmth shift ---
  // Warm sites (high temp) get a slight orange push; cold sites get blue-shifted
  // This is kept subtle — it affects the final composite, not individual layers
  float warmShift = (uTemperature - 0.5) * 0.12;  // -0.06 to +0.06
  color.r = clamp(color.r + warmShift, 0.0, 1.0);
  color.b = clamp(color.b - warmShift, 0.0, 1.0);

  // --- Lighting ---
  vec3 normal = normalize(vNormal);
  float NdotL = max(0.0, dot(normal, uSunDirection));

  // Wrap lighting for softer terminator, but keep shadows meaningful
  float wrap = max(0.0, (NdotL + 0.15) / 1.15);
  float diffuse = wrap * 0.85 + 0.15; // low ambient floor = visible shadows

  float ao = 1.0 - vSlope * 0.3;
  color *= diffuse * ao;

  // Atmospheric distance fade — polar sites use cool haze, others warm
  float dist = length(vWorldPosition.xz);
  float scatter = smoothstep(60.0, 350.0, dist);
  vec3 atmosphereColor = mix(
    vec3(0.76, 0.55, 0.40),  // warm Mars haze
    vec3(0.55, 0.65, 0.78),  // cold polar haze
    smoothstep(0.3, 0.8, uWaterIce)
  );
  color = mix(color, atmosphereColor * 0.3, scatter * 0.3);

  gl_FragColor = vec4(color, 1.0);
}
