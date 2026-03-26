varying float vAlpha;
varying float vLife;

void main() {
  vec2 center = gl_PointCoord - 0.5;
  float dist = length(center) * 2.0;
  float circle = 1.0 - smoothstep(0.4, 1.0, dist);

  vec3 dustColor = mix(
    vec3(0.76, 0.58, 0.40),
    vec3(0.55, 0.40, 0.28),
    dist * 0.6
  );

  dustColor = mix(dustColor, vec3(0.60, 0.52, 0.45), vLife * 0.4);

  gl_FragColor = vec4(dustColor, vAlpha * circle);
}
