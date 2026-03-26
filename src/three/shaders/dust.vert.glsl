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

void main() {
  vec3 pos = position;

  // Drift with wind + individual turbulence, scaled by REMS wind speed
  float t = uTime * aSpeed + aPhase;
  pos += uWindDirection * t * 2.0 * uWindSpeed;
  float turbulence = 1.0 + (uWindSpeed - 1.0) * 0.3; // turbulence grows mildly with wind
  pos.x += sin(t * 1.3 + aPhase * 6.28) * 1.5 * turbulence;
  pos.y += sin(t * 0.7 + aPhase * 3.14) * 0.8 * turbulence + uVerticalDrift * t;
  pos.z += cos(t * 1.1 + aPhase * 4.71) * 1.5 * turbulence;

  // Wrap particles within a box around the camera
  float boxSize = 80.0;
  pos = mod(pos - uCameraPos + boxSize * 0.5, vec3(boxSize)) - boxSize * 0.5 + uCameraPos;

  vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
  vDist = -mvPosition.z;

  // Fade with distance and near camera
  float distFade = smoothstep(60.0, 10.0, vDist);
  float nearFade = smoothstep(1.0, 4.0, vDist);
  vAlpha = distFade * nearFade * uDustCover * 0.6;

  gl_PointSize = aSize * (200.0 / -mvPosition.z);
  gl_Position = projectionMatrix * mvPosition;
}
