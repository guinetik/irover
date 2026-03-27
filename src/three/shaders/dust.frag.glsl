uniform vec3 uParticleColor;
uniform float uWindSpeed;

varying float vAlpha;
varying float vDist;
varying vec2 vWindScreenDir;

void main() {
  vec2 center = gl_PointCoord - vec2(0.5);

  // Wind stretching — mild elongation along wind direction
  float stretch = 1.0 + smoothstep(0.5, 3.0, uWindSpeed) * 1.0;
  vec2 windDir = normalize(vWindScreenDir + 0.001);
  vec2 windPerp = vec2(-windDir.y, windDir.x);
  float alongWind = dot(center, windDir);
  float acrossWind = dot(center, windPerp);
  float d = length(vec2(alongWind / stretch, acrossWind));

  // Tight circular falloff — discard outside radius for clean circles
  if (d > 0.35) discard;
  float alpha = smoothstep(0.35, 0.15, d) * vAlpha;

  gl_FragColor = vec4(uParticleColor, alpha);
}
