varying float vAlpha;

void main() {
  float dist = length(gl_PointCoord - 0.5);
  if (dist > 0.5) discard;
  float alpha = smoothstep(0.5, 0.15, dist) * vAlpha;

  vec3 color = mix(vec3(1.0, 0.45, 0.1), vec3(1.0, 0.7, 0.3), vAlpha);

  gl_FragColor = vec4(color, alpha);
}
