uniform float uTime;
uniform float uDustCover;
uniform vec3 uWindDirection;
uniform float uWindSpeed;
uniform vec3 uCameraPos;
uniform float uVerticalDrift;
/**
 * World-space Y of the rover (terrain surface level).
 * Particles wrap around this so they stay near the rover regardless of terrain elevation.
 */
uniform float uRoverY;

attribute float aSize;
attribute float aSpeed;
attribute float aPhase;

varying float vAlpha;
varying float vDist;
varying vec2 vWindScreenDir;

void main() {
  vec3 pos = position;

  // Tight XZ box around camera — storms pack a little tighter
  float stormDensity = smoothstep(1.0, 4.0, uWindSpeed);
  float boxXZ = mix(22.0, 14.0, stormDensity);

  // Rover-relative Y box: particles stay close to terrain regardless of elevation.
  // boxY is intentionally narrow so nothing floats high above the rover.
  float boxY = 5.0;

  // XZ — wrap around camera (same as before)
  pos.xz = mod(pos.xz - uCameraPos.xz + boxXZ * 0.5, vec2(boxXZ)) - boxXZ * 0.5 + uCameraPos.xz;

  // Y — wrap around rover instead of absolute 0..18
  // Offset the box slightly downward so more particles are near ground level.
  float boxCenterY = uRoverY + 1.5;
  pos.y = mod(pos.y - boxCenterY + boxY * 0.5, boxY) - boxY * 0.5 + boxCenterY;

  // Never let particles clip below the rover's feet
  pos.y = max(pos.y, uRoverY - 0.1);

  // Wind drift — capped lower so particles don't race across screen in storms
  float cappedWind = min(uWindSpeed, 1.2);
  float t = fract(uTime * aSpeed * 0.08 + aPhase) * 10.0;
  float windDrift = t * 0.65 * cappedWind;
  pos += uWindDirection * windDrift;

  // Turbulence: gentler multiplier so storms don't make particles frantic
  float turbulence = 1.0 + (uWindSpeed - 1.0) * 0.12;
  pos.x += sin(t * 1.3 + aPhase * 6.28) * 1.2 * turbulence;
  pos.y += sin(t * 0.7 + aPhase * 3.14) * 0.6 * turbulence + uVerticalDrift * t;
  pos.z += cos(t * 1.1 + aPhase * 4.71) * 1.2 * turbulence;

  // Second clamp after drift so particles can't drift above rover + boxY
  pos.y = clamp(pos.y, uRoverY - 0.1, uRoverY + boxY);

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
