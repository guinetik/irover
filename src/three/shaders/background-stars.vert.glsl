precision mediump float;
attribute float aSize;
attribute float aOpacity;
attribute vec3 aColor;
attribute float aPhase;
attribute vec3 position;
uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
uniform float uTime;
varying float vOpacity;
varying vec3 vColor;

void main() {
  vColor = aColor;
  float twinkle = sin(uTime * 1.8 + aPhase) * 0.32 + 0.68;
  vOpacity = aOpacity * twinkle;

  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * (620.0 / -mvPosition.z);
  gl_Position = projectionMatrix * mvPosition;
}
