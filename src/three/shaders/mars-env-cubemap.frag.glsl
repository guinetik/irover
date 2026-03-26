varying vec3 vWorldPos;

void main() {
  vec3 dir = normalize(vWorldPos);
  float y = dir.y;

  vec3 skyTop    = vec3(0.75, 0.55, 0.38);
  vec3 skyHorizon = vec3(0.85, 0.62, 0.42);
  vec3 ground    = vec3(0.25, 0.14, 0.08);

  vec3 color;
  if (y > 0.0) {
    float t = pow(y, 0.5);
    color = mix(skyHorizon, skyTop, t);
  } else {
    float t = pow(-y, 0.7);
    color = mix(skyHorizon * 0.6, ground, t);
  }

  vec3 sunDir = normalize(vec3(0.5, 0.4, 0.3));
  float sunDot = max(0.0, dot(dir, sunDir));
  color += vec3(0.4, 0.3, 0.2) * pow(sunDot, 32.0);
  color += vec3(0.15, 0.10, 0.06) * pow(sunDot, 4.0);

  gl_FragColor = vec4(color, 1.0);
}
