attribute vec3 aTargetPosition;
attribute float aSize;
attribute float aRandom;

uniform float uProgress;
uniform float uTime;
uniform vec2 uMouse;
uniform float uPixelRatio;

varying float vAlpha;

void main() {
  float progress = uProgress;
  vec3 morphed = mix(position, aTargetPosition, progress);

  float drift = aRandom * 6.2831;
  morphed += vec3(
    sin(uTime * 0.5 + drift) * 0.02 * progress,
    cos(uTime * 0.7 + drift) * 0.02 * progress,
    sin(uTime * 0.3 + drift * 0.5) * 0.02 * progress
  );

  vec4 mvPosition = modelViewMatrix * vec4(morphed, 1.0);
  gl_Position = projectionMatrix * mvPosition;

  gl_PointSize = aSize * uPixelRatio * (40.0 / -mvPosition.z);

  vAlpha = 0.15 + 0.35 * progress;
  vAlpha *= 0.5 + 0.3 * aRandom;
}
