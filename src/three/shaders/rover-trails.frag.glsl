varying float vAlpha;

void main() {
  gl_FragColor = vec4(0.45, 0.35, 0.25, vAlpha * 0.7);
}
