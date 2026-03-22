uniform float uDustCover;
uniform float uIronOxide;
uniform float uBasalt;
uniform float uRoughness;
uniform float uCraterDensity;
uniform vec3 uSunDirection;
uniform float uHeightMin;
uniform float uHeightRange;

// Detail textures
uniform sampler2D uRockTexture;   // texture1 — greyscale cracked bedrock
uniform sampler2D uDustTexture;   // texture2 — iron-rich dusty surface

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

  // Tint rock texture with basalt/iron balance
  vec3 rockTint = mix(
    vec3(0.85, 0.70, 0.55),  // warm brown rock
    vec3(0.65, 0.62, 0.60),  // cool basalt grey
    uBasalt
  );
  vec3 rockColor = rockTex * rockTint;

  // Tint dust texture with iron oxide intensity
  vec3 dustTint = mix(
    vec3(0.95, 0.80, 0.60),  // sandy
    vec3(1.10, 0.70, 0.45),  // iron-rich red
    uIronOxide
  );
  vec3 dustColor = dustTex * dustTint;

  // Dark substrate (crevices, under dust)
  vec3 substrateColor = rockTex * mix(
    vec3(0.40, 0.28, 0.20),
    vec3(0.32, 0.30, 0.28),
    uBasalt * 0.7
  );

  // --- Layer blending ---

  float slopeFactor = smoothstep(0.12, 0.45, vSlope);

  float heightDust = smoothstep(0.6, 0.3, hn) * 0.3;
  float heightExposure = smoothstep(0.5, 0.8, hn) * 0.3;

  // Dust coverage with noise breakup
  float dustAmount = uDustCover * (1.0 - slopeFactor) + heightDust;
  dustAmount = clamp(dustAmount, 0.0, 1.0);

  float dustNoise = fbm(wuv * 4.0 + 200.0, 4);
  dustAmount *= smoothstep(0.2, 0.6, dustNoise + dustAmount * 0.5);

  // Build up from substrate
  vec3 color = substrateColor;
  color = mix(color, rockColor, slopeFactor + heightExposure);
  color = mix(color, dustColor, dustAmount);

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

  // --- Lighting ---
  vec3 normal = normalize(vNormal);
  float NdotL = max(0.0, dot(normal, uSunDirection));
  float diffuse = NdotL * 0.7 + 0.3;

  float ao = 1.0 - vSlope * 0.25;
  color *= diffuse * ao;

  // Atmospheric distance fade
  float dist = length(vWorldPosition.xz);
  float scatter = smoothstep(60.0, 350.0, dist);
  vec3 atmosphereColor = vec3(0.76, 0.55, 0.40);
  color = mix(color, atmosphereColor * 0.3, scatter * 0.3);

  gl_FragColor = vec4(color, 1.0);
}
