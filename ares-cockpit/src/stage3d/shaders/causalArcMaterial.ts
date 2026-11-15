// GLSL3 (WebGL2) Pass 5 AdditiveBlending BioKG Causal Conduction Arc ShaderMaterial.
// Renders all 6 canonical hypergraph CubicBezierCurve3 TubeGeometries in 1 draw call
// with traveling directional conduction pulses (`source -> target`) and dashed muted
// segments when source region is unobserved (`aObserved < 0.5`, Issue #11).

import * as THREE from 'three';

export interface CausalArcMaterialOptions {
  opacity?: number;
}

export interface CausalArcUniforms {
  [uniform: string]: THREE.IUniform<unknown>;
  uTime: THREE.IUniform<number>;
  uOpacity: THREE.IUniform<number>;
}

export const CAUSAL_ARC_VERTEX_GLSL3 = /* glsl */ `
in float aFluxIntensity;
in float aObserved;
in vec3 aArcColor;

out vec2 vUv;
out float vFluxIntensity;
out float vObserved;
out vec3 vArcColor;

void main() {
  vUv = uv;
  vFluxIntensity = aFluxIntensity;
  vObserved = aObserved;
  vArcColor = aArcColor;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const CAUSAL_ARC_FRAGMENT_GLSL3 = /* glsl */ `
uniform float uTime;
uniform float uOpacity;

in vec2 vUv;
in float vFluxIntensity;
in float vObserved;
in vec3 vArcColor;

layout(location = 0) out vec4 fragColor;

void main() {
  // Smooth end-cap taper near source (uv.x = 0) and destination (uv.x = 1)
  float endFade = smoothstep(0.0, 0.08, vUv.x) * (1.0 - smoothstep(0.92, 1.0, vUv.x));

  if (vObserved < 0.5 || vFluxIntensity < 0.06) {
    // Dashed subdued structural edge when unobserved or dormant
    float dash = step(0.48, fract(vUv.x * 16.0));
    if (dash < 0.5) {
      discard;
    }
    float lowAlpha = 0.18 * endFade * uOpacity;
    fragColor = vec4(vArcColor * 0.65, lowAlpha);
    return;
  }

  // Directional traveling conduction packet from source -> target
  float speed = 0.65 + vFluxIntensity * 1.45;
  float phase = fract(vUv.x * 2.5 - uTime * speed);
  float packet = smoothstep(0.62, 0.98, phase) * (1.0 - smoothstep(0.98, 1.0, phase));
  float carrier = 0.18 + 0.35 * vFluxIntensity;
  float glow = carrier + packet * (0.65 + 0.75 * vFluxIntensity);

  vec3 col = vArcColor * glow + vec3(0.85, 0.96, 1.0) * packet * 0.28;
  float alpha = clamp(glow * endFade * uOpacity, 0.0, 0.95);
  fragColor = vec4(col, alpha);
}
`;

export function createCausalArcMaterial(
  options: CausalArcMaterialOptions = {},
): THREE.ShaderMaterial {
  const uniforms: CausalArcUniforms = {
    uTime: { value: 0 },
    uOpacity: { value: options.opacity ?? 0.9 },
  };

  return new THREE.ShaderMaterial({
    name: 'ARESCausalArcPass5',
    glslVersion: THREE.GLSL3,
    uniforms,
    vertexShader: CAUSAL_ARC_VERTEX_GLSL3,
    fragmentShader: CAUSAL_ARC_FRAGMENT_GLSL3,
    transparent: true,
    depthTest: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
}
