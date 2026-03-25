uniform vec3 uBaseColor;
uniform vec3 uPeakColor;
uniform vec3 uHazeColor;
uniform vec3 uSunDirection;
uniform float uMaxHeight;
uniform float uHazeStart;
uniform float uHazeEnd;

varying vec3 vWorldPosition;
varying vec3 vNormal;
varying float vHeight;
varying float vSlope;
varying float vDistFromCenter;

// Simple value noise
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float valueNoise(vec2 p) {
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
  vec2 shift = vec2(100.0);
  for (int i = 0; i < 4; i++) {
    v += a * valueNoise(p);
    p = p * 2.0 + shift;
    a *= 0.5;
  }
  return v;
}

void main() {
  float hn = clamp(vHeight / max(uMaxHeight, 1.0), 0.0, 1.0);

  // --- Height-based color gradient ---
  vec3 color = mix(uBaseColor, uPeakColor, smoothstep(0.0, 0.8, hn));

  // --- Rock strata on cliff faces ---
  float strata = sin(vHeight * 0.15 + 1.0) * 0.5 + 0.5;
  vec3 strataColor = mix(uBaseColor * 0.9, uPeakColor * 1.05, strata);
  float strataMask = smoothstep(0.3, 0.7, vSlope);
  color = mix(color, strataColor, strataMask * 0.3);

  // --- Surface noise for subtle variation (additive, not multiplicative) ---
  float noise = fbm(vWorldPosition.xz * 0.015);
  color += (noise - 0.5) * 0.06;

  // --- Lighting ---
  vec3 normal = normalize(vNormal);
  float NdotL = max(0.0, dot(normal, uSunDirection));
  float wrap = (NdotL + 0.4) / 1.4;
  float diffuse = clamp(wrap * 0.55 + 0.45, 0.45, 1.0);
  color *= diffuse;

  // --- Dust on flat tops ---
  float dustSettle = (1.0 - vSlope) * smoothstep(0.2, 0.6, hn);
  color = mix(color, uPeakColor * 1.1, dustSettle * 0.2);

  // --- Atmospheric haze ---
  float hazeFactor = smoothstep(uHazeStart, uHazeEnd, vDistFromCenter);
  float heightFade = 1.0 - smoothstep(0.3, 0.9, hn) * 0.4;
  hazeFactor *= heightFade;
  color = mix(color, uHazeColor, hazeFactor * 0.7);

  gl_FragColor = vec4(color, 1.0);
}
