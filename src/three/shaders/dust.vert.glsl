uniform float uTime;
uniform float uDustCover;
uniform vec3 uWindDirection;
uniform float uWindSpeed;
uniform vec3 uCameraPos;
uniform float uVerticalDrift;

attribute float aSize;
attribute float aSpeed;
attribute float aPhase;

varying float vAlpha;
varying float vDist;
varying vec2 vWindScreenDir;

void main() {
  vec3 pos = position;

  // Tight box around camera — storms pack even tighter
  float stormDensity = smoothstep(1.0, 4.0, uWindSpeed);
  float boxXZ = mix(24.0, 16.0, stormDensity);
  float boxY = 18.0;
  pos.xz = mod(pos.xz - uCameraPos.xz + boxXZ * 0.5, vec2(boxXZ)) - boxXZ * 0.5 + uCameraPos.xz;
  pos.y = mod(pos.y, boxY);

  // Wind drift — slow and heavy, not frantic
  float cappedWind = min(uWindSpeed, 1.8);
  float t = fract(uTime * aSpeed * 0.08 + aPhase) * 10.0;
  float windDrift = t * 1.0 * cappedWind;
  pos += uWindDirection * windDrift;
  float turbulence = 1.0 + (uWindSpeed - 1.0) * 0.3;
  pos.x += sin(t * 1.3 + aPhase * 6.28) * 2.0 * turbulence;
  pos.y += sin(t * 0.7 + aPhase * 3.14) * 1.2 * turbulence + uVerticalDrift * t;
  pos.z += cos(t * 1.1 + aPhase * 4.71) * 2.0 * turbulence;

  // Keep particles above ground
  pos.y = max(pos.y, 0.3);

  vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
  vDist = -mvPosition.z;

  // Fade with distance and near camera
  float distFade = smoothstep(20.0, 3.0, vDist);
  float nearFade = smoothstep(0.3, 1.5, vDist);

  // Always visible base + wind adds more
  float baseAlpha = 0.50;
  float windAlpha = smoothstep(0.5, 3.0, uWindSpeed) * 0.25;
  vAlpha = distFade * nearFade * (baseAlpha + windAlpha);

  gl_PointSize = aSize * (120.0 / -mvPosition.z);
  gl_Position = projectionMatrix * mvPosition;

  // Project wind direction to screen space for fragment streaking
  vec4 windEnd = projectionMatrix * (mvPosition + vec4(uWindDirection * 0.5, 0.0));
  vec2 screenPos = gl_Position.xy / gl_Position.w;
  vec2 windScreenPos = windEnd.xy / windEnd.w;
  vWindScreenDir = normalize(windScreenPos - screenPos + 0.001);
}
