varying vec3 vWorldPosition;
varying vec3 vNormal;
varying float vHeight;
varying float vSlope;
varying float vDistFromCenter;

void main() {
  vNormal = normalize(normalMatrix * normal);

  vec4 worldPos = modelMatrix * vec4(position, 1.0);
  vWorldPosition = worldPos.xyz;
  vHeight = worldPos.y;

  // Slope from normal — 0 = flat, 1 = vertical
  vSlope = 1.0 - abs(normal.y);

  // Distance from world origin for atmospheric fade
  vDistFromCenter = length(worldPos.xz);

  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
