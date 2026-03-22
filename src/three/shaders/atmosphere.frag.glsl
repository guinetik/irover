uniform vec3 uAtmosphereColor;
uniform float uFresnelPower;

varying vec3 vNormal;
varying vec3 vWorldPosition;

void main() {
  vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
  float rim = 1.0 - dot(viewDirection, vNormal);
  float fresnel = pow(rim, uFresnelPower);

  // Thin, subtle haze — barely visible except at the very edge
  vec3 color = uAtmosphereColor;
  float alpha = fresnel * 0.25;

  // Fade out quickly away from the limb
  alpha *= smoothstep(0.0, 0.6, rim);

  gl_FragColor = vec4(color, alpha);
}
