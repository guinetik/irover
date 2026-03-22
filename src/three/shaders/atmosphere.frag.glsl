uniform vec3 uAtmosphereColor;
uniform float uFresnelPower;

varying vec3 vNormal;
varying vec3 vWorldPosition;

void main() {
  vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
  float fresnel = pow(1.0 - dot(viewDirection, vNormal), uFresnelPower);

  vec3 innerColor = uAtmosphereColor;
  vec3 outerColor = vec3(1.0, 0.6, 0.2);
  vec3 color = mix(innerColor, outerColor, fresnel);

  gl_FragColor = vec4(color, fresnel * 0.8);
}
