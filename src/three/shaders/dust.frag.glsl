varying float vAlpha;
varying float vDist;

void main() {
  // Soft circular particle
  vec2 center = gl_PointCoord - vec2(0.5);
  float d = length(center);
  float alpha = smoothstep(0.5, 0.15, d) * vAlpha;

  // Warm dust color
  vec3 color = vec3(0.82, 0.62, 0.42);

  gl_FragColor = vec4(color, alpha);
}
