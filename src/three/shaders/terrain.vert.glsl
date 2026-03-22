varying vec2 vUv;
varying vec3 vWorldPosition;
varying vec3 vNormal;
varying float vHeight;
varying float vSlope;

void main() {
  vUv = uv;
  vNormal = normalize(normalMatrix * normal);

  vec4 worldPos = modelMatrix * vec4(position, 1.0);
  vWorldPosition = worldPos.xyz;
  vHeight = position.y;

  // Slope from normal — 0 = flat, 1 = vertical
  vSlope = 1.0 - abs(normal.y);

  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
