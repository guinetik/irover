attribute float aSpeed;
attribute float aSize;
attribute float aPhase;
attribute float aRise;
uniform float uTime;
varying float vAlpha;
varying float vLife;

void main() {
  float life = uTime / 4.0;
  vLife = life;

  float decel = 1.0 - life * life * 0.6;
  vec3 pos = position;
  float dist = length(pos.xz);
  vec2 dir = dist > 0.01 ? pos.xz / dist : vec2(1.0, 0.0);

  float radial = aSpeed * uTime * decel;
  pos.xz += dir * radial;

  float turb = sin(aPhase + uTime * 2.5) * 0.5 + cos(aPhase * 1.7 + uTime * 1.8) * 0.3;
  pos.x += turb * (0.3 + life * 0.8);
  pos.z += cos(aPhase + uTime * 3.0) * turb * 0.4;

  pos.y += aRise * uTime * (1.0 - life * 0.4);

  float fadeIn = smoothstep(0.0, 0.05, life);
  float fadeOut = 1.0 - smoothstep(0.3, 1.0, life);
  vAlpha = fadeIn * fadeOut * 0.7;

  float size = aSize * (1.0 + uTime * 1.5);

  vec4 mvPos = modelViewMatrix * vec4(pos, 1.0);
  gl_PointSize = size * (300.0 / -mvPos.z);
  gl_Position = projectionMatrix * mvPos;
}
