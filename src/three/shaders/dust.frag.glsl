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

  // Hard-edged crystal falloff
  if (d > 0.42) discard;
  float alpha = smoothstep(0.42, 0.30, d) * vAlpha;

  // Boost brightness for additive blending — particles add light to background so they
  // always show up regardless of terrain or sky color behind them
  float stormDarken = smoothstep(0.8, 3.0, uWindSpeed) * 0.65;
  vec3 color = uParticleColor * (1.0 - stormDarken) * 2.2;
  gl_FragColor = vec4(color, alpha);
}
